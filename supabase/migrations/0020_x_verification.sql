-- ---------------------------------------------------------------------------
-- Eventerz - 0020: make the X handle mean something
--
-- Run after 0019. Safe to re-run.
--
-- # What was wrong
--
-- `profiles.twitter` is free text that the owner types. Nothing checks it, so
-- "@vitalik" on a profile is a claim, not a fact - and it is displayed beside a
-- wallet address and a reputation score, which is exactly the context where a
-- reader assumes the surrounding fields have been checked too. On a product
-- where people send each other SOL from a chat window, an impersonated social
-- handle is not a cosmetic problem.
--
-- # The fix
--
-- Keep the free-text field - not everyone will connect an account, and a blank
-- profile is worse than an unverified handle - but let someone *prove* it by
-- linking their X account through Supabase Auth, and record that separately.
--
-- The proof cannot come from the client. A browser saying "I am @saadanwar"
-- is the same claim as typing it in the box. `auth.identities` is written by
-- GoTrue after the OAuth exchange, so it is the one place the handle is a fact,
-- and this function is SECURITY DEFINER purely to reach it.
--
-- # Why `twitter_verified` is not writable by anyone
--
-- Following 0013's rule for `reputation` and 0017's column grants: a flag that
-- means "we checked this" must not be settable by the party being checked.
-- There is no grant for it below, so the only thing that can raise it is
-- `sync_x_identity()`, which reads the identity rather than trusting an
-- argument. It takes no parameters for the same reason.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists twitter_verified boolean not null default false;

-- ---------------------------------------------------------------------------
-- Editing the handle by hand drops the verification
--
-- Otherwise: link the account, get the tick, then quietly retype the field as
-- somebody else's handle and keep it. The tick has to describe the value that
-- is in the column *now*.
--
-- The condition allows `sync_x_identity()` to set both in one statement - it
-- changes `twitter_verified` itself, so the trigger leaves its decision alone.
-- Any other writer only has a grant on `twitter`, so the flag falls.
-- ---------------------------------------------------------------------------

create or replace function public.clear_twitter_verification()
returns trigger
language plpgsql
as $$
begin
  if new.twitter is distinct from old.twitter
     and new.twitter_verified is not distinct from old.twitter_verified then
    new.twitter_verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_twitter_verification on public.profiles;
create trigger profiles_clear_twitter_verification
  before update on public.profiles
  for each row execute function public.clear_twitter_verification();

-- ---------------------------------------------------------------------------
-- Adopt the handle from a linked X identity
--
-- Returns the updated profile so the client can render the result without a
-- second round trip and without guessing what was stored.
-- ---------------------------------------------------------------------------

create or replace function public.sync_x_identity()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  handle text;
  updated public.profiles;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  /*
   * X exposes the handle as `user_name`; `screen_name` is the older key and
   * some provider versions still send that one. `preferred_username` is the
   * generic OIDC spelling. Checked in that order rather than assuming one,
   * because the failure is a silent blank rather than an error.
   */
  select coalesce(
           i.identity_data ->> 'user_name',
           i.identity_data ->> 'screen_name',
           i.identity_data ->> 'preferred_username'
         )
    into handle
    from auth.identities i
   where i.user_id = me
     and i.provider = 'twitter'
   limit 1;

  if handle is null or length(trim(handle)) = 0 then
    raise exception 'No X account is linked to this login.'
      using errcode = 'P0002';
  end if;

  update public.profiles
     set twitter = trim(leading '@' from trim(handle)),
         twitter_verified = true
   where id = me
  returning * into updated;

  return updated;
end;
$$;

revoke all on function public.sync_x_identity() from public, anon;
grant execute on function public.sync_x_identity() to authenticated;

/*
 * `twitter_verified` is intentionally missing from this grant list - see the
 * header. 0017 granted the editable columns explicitly; this re-states that
 * list so the new column is visibly not part of it.
 */
grant update (
  name, handle, bio, location, website, twitter, interests, avatar_url
) on public.profiles to authenticated;
