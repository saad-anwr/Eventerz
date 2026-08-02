-- ---------------------------------------------------------------------------
-- Eventerz - identity schema
--
-- Run once in the Supabase SQL editor (Dashboard -> SQL -> New query), or via
-- `supabase db push` if you use the CLI. Safe to re-run: every statement is
-- guarded.
--
-- Model: the wallet is the primary identity. A Google account is a secondary
-- credential attached to the same profile, used for recovery and cross-device
-- sync. A profile with no `wallet_address` is "wallet pending" - it can browse
-- and hold a profile, but cannot perform on-chain actions.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  -- 1:1 with auth.users. Deleting the auth user deletes the profile.
  id uuid primary key references auth.users (id) on delete cascade,

  -- Display identity.
  name        text        not null default 'New member',
  handle      text        unique,
  avatar_url  text,
  bio         text,
  location    text,
  website     text,
  twitter     text,

  -- Primary credential. Null until the user connects a wallet.
  -- Unique so one wallet cannot be claimed by two accounts.
  wallet_address text unique,

  /*
   * There is deliberately no `email` column.
   *
   * This table originally mirrored the OAuth address here, justified as "the
   * lookup that lets a returning Google user resolve to their existing wallet
   * account". That lookup was never built - `profile_for_wallet()` below goes
   * the other way - so the column was written once at signup and read by
   * nothing, while sitting in the one table that is world-readable (see the RLS
   * section) and broadcast over Realtime.
   *
   * 0015 closed the read path with a column privilege and 0021 removed the
   * column outright; 0021 carries the full argument. It is gone from here as
   * well so a fresh database never creates it, rather than creating a column of
   * personal data and dropping it twenty migrations later. The address lives in
   * `auth.users.email`, which is where it was being copied from.
   */

  -- Portable on-chain reputation.
  reputation int not null default 0 check (reputation >= 0),
  interests  text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.wallet_address is
  'Primary identity. Null means the account is wallet-pending: browsing works, on-chain actions do not.';

create index if not exists profiles_wallet_address_idx on public.profiles (wallet_address);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Provision a profile whenever an auth user is created
--
-- Runs as SECURITY DEFINER because the inserting role is `supabase_auth_admin`,
-- which has no rights on `public`. `search_path` is pinned to defeat search-path
-- hijacking, which is the standard hazard with definer functions.
-- ---------------------------------------------------------------------------

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
  -- Google returns `full_name`; other providers vary. Fall back to the email
  -- local-part, then to a generic label.
  display := coalesce(
    nullif(meta ->> 'full_name', ''),
    nullif(meta ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New member'
  );

  avatar := coalesce(nullif(meta ->> 'avatar_url', ''), nullif(meta ->> 'picture', ''));

  -- Derive a URL-safe handle, then de-duplicate.
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

  /*
   * `new.email` is read above to derive a display name and nothing more - a
   * local variable inside a SECURITY DEFINER function, not a stored copy. The
   * address itself is not written here; see the note on the table.
   */
  insert into public.profiles (id, name, handle, avatar_url)
  values (new.id, display, final_handle, avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Profiles are publicly readable (attendee lists, host cards, Discover need
-- them), but only the owner may write, and only to their own row.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "users insert their own profile" on public.profiles;
create policy "users insert their own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- Wallet linking
--
-- Claiming a wallet is a privileged operation: it must refuse a wallet already
-- bound to another profile. Doing it in a function keeps that check atomic
-- rather than racing between a SELECT and an UPDATE on the client.
--
-- NOTE: this trusts that the caller proved wallet ownership. Signature
-- verification belongs in an Edge Function before production - see
-- `docs/AUTH_SETUP.md`.
-- ---------------------------------------------------------------------------

create or replace function public.link_wallet(p_wallet_address text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  claimed uuid;
  result  public.profiles;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_wallet_address is null or length(trim(p_wallet_address)) < 32 then
    raise exception 'invalid wallet address' using errcode = '22023';
  end if;

  select id into claimed
  from public.profiles
  where wallet_address = p_wallet_address;

  if claimed is not null and claimed <> me then
    raise exception 'wallet already linked to another account'
      using errcode = '23505';
  end if;

  update public.profiles
  set wallet_address = p_wallet_address
  where id = me
  returning * into result;

  return result;
end;
$$;

revoke all on function public.link_wallet(text) from public;
grant execute on function public.link_wallet(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Look up the profile bound to a wallet, so a returning Google user can be
-- reconciled with the wallet account they already own.
-- ---------------------------------------------------------------------------

create or replace function public.profile_for_wallet(p_wallet_address text)
returns public.profiles
language sql
stable
as $$
  select * from public.profiles where wallet_address = p_wallet_address limit 1;
$$;
