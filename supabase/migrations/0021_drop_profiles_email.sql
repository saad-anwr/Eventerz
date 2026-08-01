-- ---------------------------------------------------------------------------
-- Eventerz - 0021: take the email address out of the world-readable row
--
-- Run after 0020. Safe to re-run.
--
-- # Why a revoke was not enough
--
-- 0015 closed the email leak with a column privilege:
--
--   revoke select (email) on public.profiles from anon, authenticated;
--
-- That is correct and it holds for PostgREST, which is the path it was aimed
-- at. It is not obviously enough for **Realtime**, and `profiles` is in the
-- `supabase_realtime` publication with `replica identity full` (0003), with
-- both apps subscribed to `postgres_changes` on it.
--
-- Realtime authorises each event against the subscriber's RLS. The row filter
-- is therefore doing nothing here at all: the policy on `profiles` is
-- `for select using (true)`, so *every* subscriber is authorised for *every*
-- row. Whether the address is stripped from the payload then rests entirely on
-- whether Realtime also applies column privileges - and Supabase's own
-- documentation only states that requirement for the explicit column-list
-- feature, not for the default all-columns payload.
--
-- That ambiguity is the problem. A privacy guarantee that depends on undocumented
-- behaviour in a subsystem nobody was thinking about when they wrote the revoke
-- is not a guarantee; it is a bet that happens to be paying out. The same
-- question would have to be re-answered for every future view, publication and
-- Supabase feature that reads this table.
--
-- # The fix: stop storing it here
--
-- The column is written exactly once - by `handle_new_user()` at signup - and
-- **read by nothing**. Not one function, view, policy or query in 0001-0020
-- selects it. 0001 justifies it as "the lookup that lets a returning Google
-- user resolve to their existing wallet account", but that lookup was never
-- implemented; `profile_for_wallet()` goes the other way, from address to
-- profile.
--
-- So this is a copy of a value that already lives in `auth.users.email`,
-- serving no reader, sitting in the one table that is world-readable and
-- broadcast over a websocket. Dropping it is not a mitigation - it removes the
-- thing being mitigated, and every path to it at once: PostgREST, Realtime,
-- `select *`, any view built on the table, and any future feature that reads a
-- row without thinking about which columns are in it.
--
-- Where the address lives afterwards:
--   - `auth.users.email` - the source of truth, written by GoTrue.
--   - The owner's own session - which is where both clients already read it
--     from, since 0015.
--   - `service_role`, for Edge Functions that need to send mail. They can
--     select it from `auth.users`, which is the authoritative row anyway.
--
-- Note the shape here matches 0019: a private field belongs somewhere only its
-- owner can reach, not in `profiles` behind a column privilege. 0019 made that
-- argument for `phone` and built `profile_private` for it. This applies the
-- same conclusion to the field that prompted the rule.
-- ---------------------------------------------------------------------------

/*
 * `delete_my_account()` (0015) sets `email = null` while anonymising. That
 * statement has to stop referencing the column before it disappears, or the
 * next deletion fails.
 *
 * Redefined in full rather than patched, so this migration is self-contained
 * and the function does not depend on 0015 having run a particular way.
 */
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'You must be signed in to delete your account.'
      using errcode = '42501';
  end if;

  delete from public.notifications     where profile_id = me;
  delete from public.event_reminders   where profile_id = me;
  delete from public.friend_requests   where requester_id = me or addressee_id = me;
  delete from public.community_members where profile_id = me;
  delete from public.wallet_link_nonces where profile_id = me;

  -- Private contact details (0019). The cascade would take it too, but the
  -- profile row survives as a tombstone, so it has to go explicitly.
  delete from public.profile_private   where id = me;

  update public.messages
     set body = '[deleted]'
   where sender_id = me
     and kind = 'text';

  delete from public.rsvps r
   using public.events e
   where r.profile_id = me
     and r.event_id = e.id
     and e.starts_at > now();

  update public.profiles
     set name             = 'Deleted account',
         handle           = 'deleted' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
         wallet_address   = null,
         avatar_url       = null,
         bio              = null,
         location         = null,
         website          = null,
         twitter          = null,
         twitter_verified = false,
         interests        = '{}',
         reputation       = 0
   where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

/*
 * `handle_new_user()` stops mirroring the address.
 *
 * It still reads `new.email` to derive a display name when the provider sends
 * no `full_name` - that is a transient local variable inside a SECURITY DEFINER
 * function, not a stored copy, and the derived handle is public by intent.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display     text;
  avatar      text;
  base_handle text;
  final_handle text;
  suffix      int := 0;
begin
  display := coalesce(
    nullif(meta ->> 'full_name', ''),
    nullif(meta ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New member'
  );

  avatar := coalesce(nullif(meta ->> 'avatar_url', ''), nullif(meta ->> 'picture', ''));

  base_handle := regexp_replace(lower(display), '[^a-z0-9]', '', 'g');
  if base_handle = '' then
    base_handle := 'member';
  end if;
  base_handle := left(base_handle, 16);
  final_handle := base_handle;

  while exists (select 1 from public.profiles p where p.handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := left(base_handle, 14) || suffix::text;
  end loop;

  insert into public.profiles (id, name, handle, avatar_url)
  values (new.id, display, final_handle, avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- The index goes with the column; dropping it first keeps the drop clean if it
-- was ever created without the `if exists` guard.
drop index if exists public.profiles_email_idx;

alter table public.profiles drop column if exists email;

/*
 * `discoverable_people` was rebuilt in 0015 with an explicit column list that
 * did not include `email`, so it is unaffected. Recorded here because a view
 * built with `p.*` would have needed rebuilding again, and that is the failure
 * this migration is trying to make impossible to repeat.
 */
