-- ---------------------------------------------------------------------------
-- Eventerz — 0005: request-to-join approval pipeline & gated guest lists
--
-- Run after 0004. Safe to re-run.
--
-- What this migration is for
-- -------------------------
--  1. Fixes two real bugs in 0002's `rsvp()`:
--
--     (a) It required `profiles.wallet_address` to be non-null and raised
--         42501 otherwise. A Google-only account therefore could not RSVP at
--         all, and because the website never surfaced the mutation error the
--         button simply appeared dead. The wallet is still the primary
--         identity, but it is only *required* to mint an on-chain ticket — not
--         to ask to attend. It is recorded when present.
--
--     (b) The waitlist branch inserted the RSVP row and *then* raised an
--         exception. Raising rolls the transaction back, so the row it had
--         just written was discarded — the caller was told "you have been
--         added to the waitlist" and nothing was added. Full events now
--         return a waitlist row instead of raising.
--
--  2. Adds the approval pipeline: request → pending → approved | declined,
--     with the decision travelling back to the guest as a notification.
--
--  3. Gates the guest list. Until now `rsvps` was `using (true)` — world
--     readable. The full roster is now visible only to the host and to
--     confirmed guests; everyone else gets counts plus a small preview.
--
--  4. Denormalises the counts onto `events`, maintained by trigger. Three
--     reasons: list pages stop reading the roster entirely, counts stay
--     visible to people who may not read the roster, and because `events`
--     already streams over Realtime the counts move live for every viewer.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. `declined` RSVP status
   ---------------------------------------------------------------------------
   A host rejection is not the same as the guest cancelling, and the guest has
   to be able to see which of the two happened.

   Note: a new enum value cannot be *used* in the same transaction that adds it.
   Nothing below uses it at DDL time — the function bodies are text, parsed when
   they run — so this is safe as one script. If your SQL client wraps everything
   in a transaction and still objects, run this single statement on its own
   first, then the rest of the file.
   =========================================================================== */

alter type rsvp_status add value if not exists 'declined';

/* ===========================================================================
   2. Denormalised counts on `events`
   =========================================================================== */

alter table public.events
  add column if not exists confirmed_count int not null default 0,
  add column if not exists pending_count   int not null default 0,
  add column if not exists waitlist_count  int not null default 0,
  add column if not exists checked_in_count int not null default 0;

/**
 * Recompute one event's counters from the source tables.
 *
 * Deliberately a full recount rather than an incremental +1/-1: the trigger
 * fires on INSERT, UPDATE and DELETE and a status can move between any two
 * values, so incremental arithmetic has far more ways to drift. At this row
 * count the recount is cheap and it is self-healing — a wrong counter fixes
 * itself on the next write.
 */
create or replace function public.recount_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.events e
  set
    confirmed_count = coalesce(c.confirmed, 0),
    pending_count   = coalesce(c.pending, 0),
    waitlist_count  = coalesce(c.waitlist, 0),
    checked_in_count = coalesce(t.checked_in, 0)
  from
    (select
       count(*) filter (where status = 'confirmed') as confirmed,
       count(*) filter (where status = 'pending')   as pending,
       count(*) filter (where status = 'waitlist')  as waitlist
     from public.rsvps where event_id = p_event_id) c,
    (select count(*) filter (where status = 'used') as checked_in
     from public.tickets where event_id = p_event_id) t
  where e.id = p_event_id;
end;
$$;

create or replace function public.rsvps_recount_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- On UPDATE the event never changes, but on DELETE only OLD exists.
  perform public.recount_event(coalesce(new.event_id, old.event_id));
  return null;
end;
$$;

drop trigger if exists rsvps_recount on public.rsvps;
create trigger rsvps_recount
  after insert or update or delete on public.rsvps
  for each row execute function public.rsvps_recount_trigger();

drop trigger if exists tickets_recount on public.tickets;
create trigger tickets_recount
  after insert or update or delete on public.tickets
  for each row execute function public.rsvps_recount_trigger();

-- Backfill for events that already exist.
do $$
declare
  e record;
begin
  for e in select id from public.events loop
    perform public.recount_event(e.id);
  end loop;
end $$;

/* ===========================================================================
   3. Guest-list visibility
   ---------------------------------------------------------------------------
   Confirmed guests and the host see the roster. Everyone else sees their own
   row only — enough to render "you asked to join", not enough to enumerate
   who else is attending. Counts come from the columns above, so a stranger
   still sees "42 going" without being able to list the 42.
   =========================================================================== */

create or replace function public.is_confirmed_attendee(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.rsvps
    where event_id = p_event_id
      and profile_id = p_profile_id
      and status = 'confirmed'
  );
$$;

grant execute on function public.is_confirmed_attendee(uuid, uuid) to anon, authenticated;

drop policy if exists "rsvps readable" on public.rsvps;
create policy "rsvps readable" on public.rsvps
  for select using (
    -- Your own row, always: you have to be able to see your own status.
    profile_id = (select auth.uid())
    -- The host sees everything, including who they declined.
    or public.is_event_host(event_id, (select auth.uid()))
    /*
     * A confirmed guest sees the other *confirmed* guests, and nothing else.
     * Restricting to `confirmed` here rather than only in the UI matters: a
     * declined request is between that person and the host, and letting fellow
     * guests enumerate rejections would publish the host's moderation.
     */
    or (
      status = 'confirmed'
      and public.is_confirmed_attendee(event_id, (select auth.uid()))
    )
  );

/*
 * No write policies on `rsvps` at all — deliberately.
 *
 * 0002's "rsvps self write" policy let a client insert or update its own row
 * directly, which meant anyone could `update rsvps set status = 'confirmed'`
 * and walk straight past capacity, approval and ticket allocation. A
 * cancel-only UPDATE policy has the same hole, because RLS can restrict *which
 * rows* you may touch but not *which values* you may set.
 *
 * Every write therefore goes through the SECURITY DEFINER functions below.
 * Those run as the function owner and bypass RLS, so no policy is needed for
 * them — and with none present, a direct client write is refused outright.
 */
drop policy if exists "rsvps self write" on public.rsvps;
drop policy if exists "rsvps self cancel" on public.rsvps;

/**
 * Counts plus a handful of faces, for people who may not read the roster.
 *
 * SECURITY DEFINER so it can aggregate rows the caller cannot select. It
 * returns at most `p_limit` profiles and never a status, so it cannot be used
 * to page through the full guest list. Profiles are world-readable already
 * (0001), so the preview leaks nothing new — it is the *association* with an
 * event that stays private, and a bounded sample is what the product wants:
 * "Ayush, Sara and 40 others are going".
 */
create or replace function public.event_guest_preview(
  p_event_id uuid,
  p_limit int default 3
)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  -- The limit is applied in the subquery, before the join, and clamped to
  -- [0, 12] server-side so a caller cannot widen the sample by passing a large
  -- p_limit and paging out the whole roster.
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', p.id, 'name', p.name, 'avatar_url', p.avatar_url)
      order by sample.created_at
    ),
    '[]'::jsonb
  )
  from (
    select profile_id, created_at
    from public.rsvps
    where event_id = p_event_id and status = 'confirmed'
    order by created_at
    limit greatest(least(p_limit, 12), 0)
  ) sample
  join public.profiles p on p.id = sample.profile_id;
$$;

grant execute on function public.event_guest_preview(uuid, int) to anon, authenticated;

/* ===========================================================================
   4. Request to join
   ---------------------------------------------------------------------------
   Replaces 0002's `rsvp()`. Returns the resulting status so the client can
   render the right thing without a second round trip.
   =========================================================================== */

/**
 * Ask to attend an event.
 *
 * Outcome, in order of precedence:
 *   • already have a live RSVP  → that status, unchanged (double-tap is safe)
 *   • event full                → 'waitlist'
 *   • event requires approval   → 'pending'
 *   • otherwise                 → 'confirmed', and a ticket is issued
 *
 * Capacity is counted from confirmed guests only. Pending requests do not
 * hold a seat — a host who approves more people than the venue fits is making
 * a decision, not hitting a race, and holding seats for unapproved requests
 * would let anyone fill an event by requesting and never being approved.
 */
create or replace function public.request_to_join(p_event_id uuid)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  me          uuid := auth.uid();
  ev          public.events;
  confirmed   int;
  my_wallet   text;
  next_serial int;
  new_status  rsvp_status;
  result      public.rsvps;
begin
  if me is null then
    raise exception 'Sign in to RSVP.' using errcode = '28000';
  end if;

  -- `for update` serialises concurrent requests for this event, so the
  -- capacity check and the seat it grants cannot interleave.
  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;

  if ev.host_id = me then
    raise exception 'You are hosting this event.' using errcode = '22023';
  end if;

  if coalesce(ev.ends_at, ev.starts_at) < now() then
    raise exception 'This event has already ended.' using errcode = '22023';
  end if;

  -- Recorded when present, never required: a wallet is what mints an on-chain
  -- ticket, not what lets someone ask to attend.
  select wallet_address into my_wallet from public.profiles where id = me;

  select * into result from public.rsvps
  where event_id = p_event_id and profile_id = me;

  -- A live RSVP is idempotent. A previously cancelled or declined one may be
  -- retried, so it falls through and is recomputed below.
  if found and result.status in ('confirmed', 'pending', 'waitlist') then
    return result;
  end if;

  select count(*) into confirmed from public.rsvps
  where event_id = p_event_id and status = 'confirmed';

  new_status := case
    when confirmed >= ev.capacity then 'waitlist'
    when ev.requires_approval     then 'pending'
    else 'confirmed'
  end;

  insert into public.rsvps (event_id, profile_id, status, wallet_address)
  values (p_event_id, me, new_status, my_wallet)
  on conflict (event_id, profile_id) do update
    set status = excluded.status,
        wallet_address = coalesce(excluded.wallet_address, public.rsvps.wallet_address)
  returning * into result;

  if new_status = 'confirmed' then
    select coalesce(max(serial), 0) + 1 into next_serial
    from public.tickets where event_id = p_event_id;

    insert into public.tickets (event_id, owner_id, serial, soulbound)
    values (p_event_id, me, next_serial, ev.token_gated)
    on conflict (event_id, owner_id) do nothing;
  end if;

  -- Tell the host about anything needing a decision; confirm to the guest
  -- otherwise. Both parties always learn the outcome.
  if new_status = 'pending' then
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      ev.host_id, 'rsvp', 'New request to join',
      format('%s asked to attend %s.',
             (select coalesce(name, 'Someone') from public.profiles where id = me),
             ev.title),
      '/events/' || p_event_id
    );
  elsif new_status = 'waitlist' then
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      me, 'rsvp', 'You are on the waitlist',
      format('%s is full. You will be let in automatically if a spot opens.', ev.title),
      '/events/' || p_event_id
    );
  else
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      me, 'ticket', 'You are going',
      format('Your spot at %s is confirmed.', ev.title),
      '/events/' || p_event_id
    );
  end if;

  return result;
end;
$$;

revoke all on function public.request_to_join(uuid) from public;
grant execute on function public.request_to_join(uuid) to authenticated;

/* ===========================================================================
   5. Host decisions
   =========================================================================== */

/**
 * Approve a pending or waitlisted guest. Host only.
 *
 * Issues the ticket at the moment of approval, so a serial is only ever spent
 * on someone who is actually coming.
 */
create or replace function public.approve_guest(
  p_event_id uuid,
  p_profile_id uuid
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  me          uuid := auth.uid();
  ev          public.events;
  confirmed   int;
  next_serial int;
  result      public.rsvps;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  if ev.host_id <> me then
    raise exception 'Only the host can approve guests.' using errcode = '42501';
  end if;

  select count(*) into confirmed from public.rsvps
  where event_id = p_event_id and status = 'confirmed';
  if confirmed >= ev.capacity then
    raise exception 'This event is at capacity — raise it to approve more guests.'
      using errcode = '23514';
  end if;

  update public.rsvps set status = 'confirmed'
  where event_id = p_event_id and profile_id = p_profile_id
    and status in ('pending', 'waitlist')
  returning * into result;

  if not found then
    raise exception 'No pending request from that guest.' using errcode = 'P0002';
  end if;

  select coalesce(max(serial), 0) + 1 into next_serial
  from public.tickets where event_id = p_event_id;

  insert into public.tickets (event_id, owner_id, serial, soulbound)
  values (p_event_id, p_profile_id, next_serial, ev.token_gated)
  on conflict (event_id, owner_id) do nothing;

  insert into public.notifications (profile_id, kind, title, body, href)
  values (
    p_profile_id, 'rsvp', 'Request approved',
    format('You are going to %s. Your ticket is ready.', ev.title),
    '/events/' || p_event_id
  );

  return result;
end;
$$;

/**
 * Decline a request, or remove a guest who was already confirmed.
 *
 * One function for both because they are the same host action — "this person
 * is not coming" — and because removing a confirmed guest has to free the
 * seat and pull in the next waitlister, which declining a pending request
 * does not.
 */
create or replace function public.decline_guest(
  p_event_id uuid,
  p_profile_id uuid
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  ev       public.events;
  was      rsvp_status;
  result   public.rsvps;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  if ev.host_id <> me then
    raise exception 'Only the host can manage guests.' using errcode = '42501';
  end if;

  select status into was from public.rsvps
  where event_id = p_event_id and profile_id = p_profile_id;
  if was is null then
    raise exception 'That person has not asked to attend.' using errcode = 'P0002';
  end if;

  update public.rsvps set status = 'declined'
  where event_id = p_event_id and profile_id = p_profile_id
  returning * into result;

  -- The ticket goes with the seat.
  delete from public.tickets
  where event_id = p_event_id and owner_id = p_profile_id;

  insert into public.notifications (profile_id, kind, title, body, href)
  values (
    p_profile_id, 'rsvp',
    case when was = 'confirmed' then 'Removed from an event'
         else 'Request declined' end,
    case when was = 'confirmed'
         then format('The host removed you from %s.', ev.title)
         else format('The host declined your request to join %s.', ev.title) end,
    '/events/' || p_event_id
  );

  if was = 'confirmed' then
    perform public.promote_from_waitlist(p_event_id);
  end if;

  return result;
end;
$$;

revoke all on function public.approve_guest(uuid, uuid) from public;
revoke all on function public.decline_guest(uuid, uuid) from public;
grant execute on function public.approve_guest(uuid, uuid) to authenticated;
grant execute on function public.decline_guest(uuid, uuid) to authenticated;

/* ===========================================================================
   6. Waitlist promotion
   ---------------------------------------------------------------------------
   Called whenever a confirmed seat is freed. Declared before `cancel_rsvp`
   and `decline_guest` use it — plpgsql resolves function calls at runtime, so
   the ordering in this file does not matter, but it is defined here for the
   reader.
   =========================================================================== */

/**
 * Move the longest-waiting person off the waitlist into a freed seat.
 *
 * Only auto-promotes when the event does not require approval. If it does, a
 * freed seat becomes an approvable request instead — the host asked to vet
 * every guest, and silently admitting someone would override that.
 */
create or replace function public.promote_from_waitlist(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev          public.events;
  confirmed   int;
  nxt         uuid;
  next_serial int;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return; end if;

  select count(*) into confirmed from public.rsvps
  where event_id = p_event_id and status = 'confirmed';
  if confirmed >= ev.capacity then return; end if;

  select profile_id into nxt from public.rsvps
  where event_id = p_event_id and status = 'waitlist'
  order by created_at
  limit 1;
  if nxt is null then return; end if;

  if ev.requires_approval then
    update public.rsvps set status = 'pending'
    where event_id = p_event_id and profile_id = nxt;

    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      ev.host_id, 'rsvp', 'A waitlisted guest needs a decision',
      format('A spot opened at %s and someone is waiting for approval.', ev.title),
      '/events/' || p_event_id
    );
    return;
  end if;

  update public.rsvps set status = 'confirmed'
  where event_id = p_event_id and profile_id = nxt;

  select coalesce(max(serial), 0) + 1 into next_serial
  from public.tickets where event_id = p_event_id;

  insert into public.tickets (event_id, owner_id, serial, soulbound)
  values (p_event_id, nxt, next_serial, ev.token_gated)
  on conflict (event_id, owner_id) do nothing;

  insert into public.notifications (profile_id, kind, title, body, href)
  values (
    nxt, 'ticket', 'A spot opened up',
    format('You are off the waitlist for %s — you are going.', ev.title),
    '/events/' || p_event_id
  );
end;
$$;

grant execute on function public.promote_from_waitlist(uuid) to authenticated;

/* ===========================================================================
   7. Cancelling, with promotion
   =========================================================================== */

create or replace function public.cancel_rsvp(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  was rsvp_status;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select status into was from public.rsvps
  where event_id = p_event_id and profile_id = me;
  if was is null then return; end if;

  delete from public.tickets where event_id = p_event_id and owner_id = me;
  update public.rsvps set status = 'cancelled'
  where event_id = p_event_id and profile_id = me;

  -- Freeing a confirmed seat is what lets the next person in.
  if was = 'confirmed' then
    perform public.promote_from_waitlist(p_event_id);
  end if;
end;
$$;

revoke all on function public.cancel_rsvp(uuid) from public;
grant execute on function public.cancel_rsvp(uuid) to authenticated;

/* ===========================================================================
   8. `rsvp()` kept as a thin alias
   ---------------------------------------------------------------------------
   The mobile app in the field still calls `rsvp`. Rather than break installed
   builds, it forwards to the new implementation. New code should call
   `request_to_join`, which returns the resulting status.
   =========================================================================== */

-- Dropped rather than replaced: 0002 declared it `returns public.tickets`, and
-- CREATE OR REPLACE cannot change a function's return type.
drop function if exists public.rsvp(uuid);
create or replace function public.rsvp(p_event_id uuid)
returns public.rsvps
language sql
security definer
set search_path = public
as $$
  -- `select * from f()` rather than `select f()`: the latter yields one column
  -- of composite type, which does not satisfy a composite return declaration.
  select * from public.request_to_join(p_event_id);
$$;

revoke all on function public.rsvp(uuid) from public;
grant execute on function public.rsvp(uuid) to authenticated;

/* ===========================================================================
   9. Event chat is for confirmed guests
   ---------------------------------------------------------------------------
   0003 admitted anyone with a non-cancelled RSVP, which included pending
   requests — someone the host had not yet accepted, and might decline, could
   read and post in the attendee channel.
   =========================================================================== */

create or replace function public.can_access_channel(p_channel_id text, p_profile_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_profile_id is null then
    return false;
  end if;

  if p_channel_id like 'dm:%' then
    return position(p_profile_id::text in p_channel_id) > 0;
  end if;

  return public.is_event_host(p_channel_id::uuid, p_profile_id)
      or public.is_confirmed_attendee(p_channel_id::uuid, p_profile_id);
exception when others then
  return false;
end;
$$;

grant execute on function public.can_access_channel(text, uuid) to authenticated;

/* ===========================================================================
   10. Guest list for the host
   ---------------------------------------------------------------------------
   The host panel needs the roster joined to profiles. RLS already grants the
   host every RSVP row for their event, so this view is `security_invoker` —
   it inherits the caller's permissions rather than handing out a wider read.
   =========================================================================== */

create or replace view public.event_guests
with (security_invoker = true) as
  select
    r.event_id,
    r.profile_id,
    r.status,
    r.created_at,
    p.name,
    p.handle,
    p.avatar_url,
    p.wallet_address,
    p.reputation,
    t.id            as ticket_id,
    t.serial        as ticket_serial,
    t.status        as ticket_status,
    t.checked_in_at
  from public.rsvps r
  join public.profiles p on p.id = r.profile_id
  left join public.tickets t
    on t.event_id = r.event_id and t.owner_id = r.profile_id;

/* ===========================================================================
   11. Realtime for the new column set
   ---------------------------------------------------------------------------
   `events` is already published (0003); the added counter columns ride along
   on the same stream, which is the point of denormalising them.
   =========================================================================== */

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.tickets';
  exception when duplicate_object then null;
  end;
end $$;
