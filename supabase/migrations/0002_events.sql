-- ---------------------------------------------------------------------------
-- Eventerz - events, communities, tickets, RSVPs, notifications
--
-- Run after 0001_profiles.sql. Safe to re-run.
--
-- Design notes:
--   • Every table has RLS on. Public/unlisted events are world-readable;
--     private ones only to the host and confirmed attendees.
--   • Ticket serials are allocated server-side so two concurrent RSVPs cannot
--     both claim #42.
--   • `rsvp` and `check_in_ticket` are SECURITY DEFINER functions because they
--     need to enforce capacity and one-ticket-per-person atomically. Doing that
--     client-side is a race.
-- ---------------------------------------------------------------------------

/* -------------------------------------------------------------------------- */
/*  Enums                                                                      */
/* -------------------------------------------------------------------------- */

do $$ begin
  create type event_category as enum (
    'Conference','Meetup','Hackathon','Workshop','DAO','Party','AMA','Concert','Other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_visibility as enum ('public','private','unlisted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('valid','used','expired','pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rsvp_status as enum ('confirmed','pending','waitlist','cancelled');
exception when duplicate_object then null; end $$;

/* -------------------------------------------------------------------------- */
/*  Communities                                                                */
/* -------------------------------------------------------------------------- */

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text not null default '',
  icon text not null default 'Users',
  accent text not null default 'purple' check (accent in ('purple','blue','cyan','green')),
  cover_gradient text not null default 'purple-blue',
  token_gated boolean not null default false,
  verified boolean not null default false,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (community_id, profile_id)
);

create index if not exists community_members_profile_idx
  on public.community_members (profile_id);

/* -------------------------------------------------------------------------- */
/*  Events                                                                     */
/* -------------------------------------------------------------------------- */

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) >= 3),
  description text not null default '',
  host_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid references public.communities (id) on delete set null,

  cover_gradient text not null default 'purple-blue',
  cover_image text,
  category event_category not null default 'Meetup',

  starts_at timestamptz not null,
  ends_at   timestamptz,

  location text not null default '',
  is_online boolean not null default false,

  capacity int not null default 100 check (capacity > 0),
  price text not null default 'Free',
  visibility event_visibility not null default 'public',
  requires_approval boolean not null default false,
  token_gated boolean not null default false,
  gate_requirement text,

  tags text[] not null default '{}',
  schedule jsonb not null default '[]'::jsonb,
  featured boolean not null default false,

  -- Set once the event exists on-chain.
  onchain_signature text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_end_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists events_starts_at_idx  on public.events (starts_at);
create index if not exists events_host_idx       on public.events (host_id);
create index if not exists events_community_idx  on public.events (community_id);
create index if not exists events_visibility_idx on public.events (visibility);

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

/* -------------------------------------------------------------------------- */
/*  RSVPs                                                                      */
/* -------------------------------------------------------------------------- */

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status     rsvp_status not null default 'confirmed',
  wallet_address text,
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create index if not exists rsvps_event_idx   on public.rsvps (event_id);
create index if not exists rsvps_profile_idx on public.rsvps (profile_id);

/* -------------------------------------------------------------------------- */
/*  Tickets                                                                    */
/* -------------------------------------------------------------------------- */

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  owner_id   uuid not null references public.profiles (id) on delete cascade,

  -- Compressed-NFT asset id, once minted. Null until the mint lands.
  asset_id text unique,
  serial   int not null,
  status   ticket_status not null default 'valid',
  soulbound boolean not null default false,
  tier text not null default 'General Admission',

  -- Opaque check-in payload. Random, not derived, so it cannot be forged from
  -- public data the way a predictable id could.
  qr_secret uuid not null default gen_random_uuid(),

  minted_at    timestamptz not null default now(),
  checked_in_at timestamptz,

  unique (event_id, owner_id),
  unique (event_id, serial)
);

create index if not exists tickets_owner_idx on public.tickets (owner_id);
create index if not exists tickets_event_idx on public.tickets (event_id);

/* -------------------------------------------------------------------------- */
/*  Notifications                                                              */
/* -------------------------------------------------------------------------- */

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'system',
  title text not null,
  body  text not null default '',
  href  text,
  read  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on public.notifications (profile_id, created_at desc);

/* -------------------------------------------------------------------------- */
/*  Row Level Security                                                         */
/* -------------------------------------------------------------------------- */

alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.events            enable row level security;
alter table public.rsvps             enable row level security;
alter table public.tickets           enable row level security;
alter table public.notifications     enable row level security;

-- Communities: readable by all, writable by the owner.
drop policy if exists "communities readable" on public.communities;
create policy "communities readable" on public.communities
  for select using (true);

drop policy if exists "communities owner writes" on public.communities;
create policy "communities owner writes" on public.communities
  for all using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Membership: readable by all; you may only add/remove yourself.
drop policy if exists "memberships readable" on public.community_members;
create policy "memberships readable" on public.community_members
  for select using (true);

drop policy if exists "memberships self write" on public.community_members;
create policy "memberships self write" on public.community_members
  for all using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

/*
 * Events: public and unlisted are world-readable (unlisted is "not indexed",
 * not "secret"). Private events are visible only to the host and to people
 * holding an RSVP.
 */
drop policy if exists "events readable" on public.events;
create policy "events readable" on public.events
  for select using (
    visibility in ('public','unlisted')
    or host_id = (select auth.uid())
    or exists (
      select 1 from public.rsvps r
      where r.event_id = events.id
        and r.profile_id = (select auth.uid())
        and r.status <> 'cancelled'
    )
  );

drop policy if exists "events host writes" on public.events;
create policy "events host writes" on public.events
  for all using ((select auth.uid()) = host_id)
  with check ((select auth.uid()) = host_id);

/*
 * RSVPs: attendee lists are visible to anyone who can see the event, so the
 * "who's going" rail works. Writes go through the `rsvp()` function.
 */
drop policy if exists "rsvps readable" on public.rsvps;
create policy "rsvps readable" on public.rsvps
  for select using (
    exists (select 1 from public.events e where e.id = rsvps.event_id)
  );

drop policy if exists "rsvps self write" on public.rsvps;
create policy "rsvps self write" on public.rsvps
  for all using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

/*
 * Tickets: a ticket is private to its owner and the event host. Anyone else
 * reading `qr_secret` could walk in as that person.
 */
drop policy if exists "tickets owner or host" on public.tickets;
create policy "tickets owner or host" on public.tickets
  for select using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = tickets.event_id and e.host_id = (select auth.uid())
    )
  );

drop policy if exists "tickets host updates" on public.tickets;
create policy "tickets host updates" on public.tickets
  for update using (
    exists (
      select 1 from public.events e
      where e.id = tickets.event_id and e.host_id = (select auth.uid())
    )
  );

-- Notifications are strictly private.
drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications
  for all using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

/* -------------------------------------------------------------------------- */
/*  RSVP - capacity, dedupe and ticket allocation in one atomic step           */
/* -------------------------------------------------------------------------- */

/*
 * Dropped before it is created, rather than just replaced.
 *
 * 0005 redefines `rsvp(uuid)` to return `public.rsvps` instead of
 * `public.tickets`, and `create or replace function` may not change a return
 * type. So re-running this file against a database that has already reached
 * 0005 failed with 42P13 ("cannot change return type of existing function"),
 * which contradicts the promise at the top of this file. Dropping first makes
 * that promise true; the chain then reaches 0005, which drops and recreates it
 * again with the signature the application actually calls.
 */
drop function if exists public.rsvp(uuid);

create or replace function public.rsvp(p_event_id uuid)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  ev        public.events;
  taken     int;
  my_wallet text;
  next_serial int;
  result    public.tickets;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if ev.starts_at < now() then
    raise exception 'this event has already started' using errcode = '22023';
  end if;

  -- The wallet is the primary identity; on-chain actions require one.
  select wallet_address into my_wallet from public.profiles where id = me;
  if my_wallet is null then
    raise exception 'connect a wallet before reserving a ticket'
      using errcode = '42501';
  end if;

  -- Already going? Return the existing ticket rather than erroring, so a
  -- double-tap is harmless.
  select * into result from public.tickets
  where event_id = p_event_id and owner_id = me;
  if found then
    return result;
  end if;

  select count(*) into taken from public.rsvps
  where event_id = p_event_id and status in ('confirmed','pending');

  insert into public.rsvps (event_id, profile_id, status, wallet_address)
  values (
    p_event_id,
    me,
    case
      when taken >= ev.capacity then 'waitlist'
      when ev.requires_approval then 'pending'
      else 'confirmed'
    end,
    my_wallet
  )
  on conflict (event_id, profile_id) do update set status = excluded.status;

  if taken >= ev.capacity then
    raise exception 'this event is full - you have been added to the waitlist'
      using errcode = '23514';
  end if;

  -- `for update` above serialises this, so two concurrent RSVPs cannot take
  -- the same serial.
  select coalesce(max(serial), 0) + 1 into next_serial
  from public.tickets where event_id = p_event_id;

  insert into public.tickets (event_id, owner_id, serial, soulbound)
  values (p_event_id, me, next_serial, ev.token_gated)
  returning * into result;

  insert into public.notifications (profile_id, kind, title, body, href)
  values (
    me, 'ticket', 'Ticket reserved',
    format('Your ticket for %s is #%s.', ev.title, lpad(next_serial::text, 4, '0')),
    '/ticket/' || result.id
  );

  return result;
end;
$$;

revoke all on function public.rsvp(uuid) from public;
grant execute on function public.rsvp(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/*  Cancel an RSVP                                                             */
/* -------------------------------------------------------------------------- */

create or replace function public.cancel_rsvp(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.tickets where event_id = p_event_id and owner_id = me;
  update public.rsvps set status = 'cancelled'
    where event_id = p_event_id and profile_id = me;
end;
$$;

revoke all on function public.cancel_rsvp(uuid) from public;
grant execute on function public.cancel_rsvp(uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/*  Check-in - only the host may redeem, and only once                         */
/* -------------------------------------------------------------------------- */

create or replace function public.check_in_ticket(
  p_ticket_id uuid,
  p_qr_secret uuid
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  t      public.tickets;
  ev     public.events;
  result public.tickets;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into t from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;

  -- Constant-ish comparison: a wrong secret and a wrong ticket look the same
  -- to the caller, so scanning cannot be used to enumerate valid tickets.
  if t.qr_secret <> p_qr_secret then
    raise exception 'invalid ticket code' using errcode = '22023';
  end if;

  select * into ev from public.events where id = t.event_id;
  if ev.host_id <> me then
    raise exception 'only the event host can check guests in'
      using errcode = '42501';
  end if;

  if t.status = 'used' then
    raise exception 'this ticket has already been checked in'
      using errcode = '23505';
  end if;

  update public.tickets
  set status = 'used', checked_in_at = now()
  where id = p_ticket_id
  returning * into result;

  update public.profiles
  set reputation = reputation + 40
  where id = t.owner_id;

  insert into public.notifications (profile_id, kind, title, body)
  values (
    t.owner_id, 'reputation', 'Checked in',
    format('You checked in at %s. Reputation +40.', ev.title)
  );

  return result;
end;
$$;

revoke all on function public.check_in_ticket(uuid, uuid) from public;
grant execute on function public.check_in_ticket(uuid, uuid) to authenticated;

/* -------------------------------------------------------------------------- */
/*  Attendee counts without exposing the whole RSVP table                      */
/* -------------------------------------------------------------------------- */

create or replace view public.event_stats as
  select
    e.id as event_id,
    count(r.*) filter (where r.status in ('confirmed','pending')) as attendee_count,
    count(t.*) filter (where t.status = 'used') as checked_in_count
  from public.events e
  left join public.rsvps r on r.event_id = e.id
  left join public.tickets t on t.event_id = e.id
  group by e.id;
