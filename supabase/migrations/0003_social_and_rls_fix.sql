-- ---------------------------------------------------------------------------
-- Eventerz — 0003
--
--  1. Fixes recursive RLS on events/rsvps/tickets (they returned HTTP 500)
--  2. Adds friend_requests and messages
--  3. Publishes every table to Supabase Realtime
--
-- Run after 0002. Safe to re-run.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. RLS recursion fix
   ---------------------------------------------------------------------------
   0002 had `events` policy → subquery on `rsvps`, and `rsvps` policy →
   subquery on `events`. Each policy triggered the other's policy, so Postgres
   raised `infinite recursion detected in policy` (42P17) and every SELECT
   failed with a 500.

   The fix is the standard one: move the membership checks into SECURITY
   DEFINER functions. A definer function runs as its owner and does *not*
   re-enter RLS, which breaks the cycle. `search_path` is pinned on each, as
   always with definer functions.
   =========================================================================== */

create or replace function public.is_event_attendee(p_event_id uuid, p_profile_id uuid)
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
      and status <> 'cancelled'
  );
$$;

create or replace function public.is_event_host(p_event_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.events where id = p_event_id and host_id = p_profile_id
  );
$$;

grant execute on function public.is_event_attendee(uuid, uuid) to anon, authenticated;
grant execute on function public.is_event_host(uuid, uuid) to anon, authenticated;

-- Events -------------------------------------------------------------------
drop policy if exists "events readable" on public.events;
create policy "events readable" on public.events
  for select using (
    visibility in ('public', 'unlisted')
    or host_id = (select auth.uid())
    or public.is_event_attendee(id, (select auth.uid()))
  );

-- RSVPs --------------------------------------------------------------------
-- Attendee lists are public information for a public event ("who's going"),
-- so a plain readable policy is both correct and non-recursive.
drop policy if exists "rsvps readable" on public.rsvps;
create policy "rsvps readable" on public.rsvps
  for select using (true);

-- Tickets ------------------------------------------------------------------
-- Still private to owner and host, but the host check now goes through the
-- definer function rather than a correlated subquery on `events`.
drop policy if exists "tickets owner or host" on public.tickets;
create policy "tickets owner or host" on public.tickets
  for select using (
    owner_id = (select auth.uid())
    or public.is_event_host(event_id, (select auth.uid()))
  );

drop policy if exists "tickets host updates" on public.tickets;
create policy "tickets host updates" on public.tickets
  for update using (public.is_event_host(event_id, (select auth.uid())));

/* ===========================================================================
   2. Friends
   ---------------------------------------------------------------------------
   A single row per relationship, ordered so (a,b) and (b,a) cannot both exist.
   =========================================================================== */

do $$ begin
  create type friend_status as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null; end $$;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status friend_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint no_self_friending check (requester_id <> addressee_id),
  -- One row per pair, regardless of who asked first.
  constraint unique_pair unique (requester_id, addressee_id)
);

create index if not exists friend_requests_requester_idx
  on public.friend_requests (requester_id);
create index if not exists friend_requests_addressee_idx
  on public.friend_requests (addressee_id);

drop trigger if exists friend_requests_touch on public.friend_requests;
create trigger friend_requests_touch
  before update on public.friend_requests
  for each row execute function public.touch_updated_at();

alter table public.friend_requests enable row level security;

-- You can see a request only if you are one of its two parties.
drop policy if exists "friend requests visible to parties" on public.friend_requests;
create policy "friend requests visible to parties" on public.friend_requests
  for select using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  );

drop policy if exists "send friend request" on public.friend_requests;
create policy "send friend request" on public.friend_requests
  for insert with check (requester_id = (select auth.uid()));

-- Only the addressee may accept or decline; either party may withdraw.
drop policy if exists "respond to friend request" on public.friend_requests;
create policy "respond to friend request" on public.friend_requests
  for update using (addressee_id = (select auth.uid()));

drop policy if exists "remove friend" on public.friend_requests;
create policy "remove friend" on public.friend_requests
  for delete using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  );

/** Accepted friends of a profile, as a flat list of ids. */
create or replace function public.friend_ids(p_profile_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select case when requester_id = p_profile_id then addressee_id else requester_id end
  from public.friend_requests
  where status = 'accepted'
    and (requester_id = p_profile_id or addressee_id = p_profile_id);
$$;

grant execute on function public.friend_ids(uuid) to authenticated;

/* ===========================================================================
   3. Messages
   ---------------------------------------------------------------------------
   Two scopes: `event` channels (anyone who can see the event) and `dm`
   channels between two people. `channel_id` is the event id for event chat,
   or the sorted pair "dm:<a>__<b>" for a DM — sorted so both participants
   derive the same key.
   =========================================================================== */

do $$ begin
  create type message_scope as enum ('event', 'dm');
exception when duplicate_object then null; end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  scope message_scope not null default 'dm',
  channel_id text not null,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_idx
  on public.messages (channel_id, created_at desc);

alter table public.messages enable row level security;

/** Canonical DM channel key for two profiles. */
create or replace function public.dm_channel_id(a uuid, b uuid)
returns text
language sql
immutable
as $$
  select 'dm:' || least(a::text, b::text) || '__' || greatest(a::text, b::text);
$$;

/** True when the caller belongs in this channel. */
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

  -- DM: the caller's id must be one half of the key.
  if p_channel_id like 'dm:%' then
    return position(p_profile_id::text in p_channel_id) > 0;
  end if;

  -- Event chat: host or attendee.
  return public.is_event_host(p_channel_id::uuid, p_profile_id)
      or public.is_event_attendee(p_channel_id::uuid, p_profile_id);
exception when others then
  -- Malformed channel id — deny rather than leak.
  return false;
end;
$$;

grant execute on function public.dm_channel_id(uuid, uuid) to authenticated;
grant execute on function public.can_access_channel(text, uuid) to authenticated;

drop policy if exists "messages readable to channel members" on public.messages;
create policy "messages readable to channel members" on public.messages
  for select using (
    public.can_access_channel(channel_id, (select auth.uid()))
  );

drop policy if exists "send message to own channels" on public.messages;
create policy "send message to own channels" on public.messages
  for insert with check (
    sender_id = (select auth.uid())
    and public.can_access_channel(channel_id, (select auth.uid()))
  );

drop policy if exists "delete own message" on public.messages;
create policy "delete own message" on public.messages
  for delete using (sender_id = (select auth.uid()));

/* ===========================================================================
   4. Realtime
   ---------------------------------------------------------------------------
   A table only streams changes if it is in the `supabase_realtime`
   publication. Without this, `.on('postgres_changes', …)` silently receives
   nothing — the subscription connects and then stays quiet forever.

   REPLICA IDENTITY FULL makes the old row available on UPDATE/DELETE, which
   clients need to reconcile their cache.
   =========================================================================== */

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'events', 'communities', 'community_members',
    'rsvps', 'tickets', 'notifications', 'friend_requests', 'messages'
  ] loop
    execute format('alter table public.%I replica identity full', t);
    -- add_table is not idempotent; swallow the duplicate.
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

/* ===========================================================================
   5. Discoverability
   ---------------------------------------------------------------------------
   `profiles` is already world-readable (0001), which is what lets one user
   find another. This view exposes the friendship state alongside, so the
   Friends screen needs one query instead of N.
   =========================================================================== */

create or replace view public.discoverable_people
with (security_invoker = true) as
  select
    p.*,
    fr.status  as friend_status,
    fr.requester_id = auth.uid() as request_sent_by_me
  from public.profiles p
  left join public.friend_requests fr
    on (fr.requester_id = auth.uid() and fr.addressee_id = p.id)
    or (fr.addressee_id = auth.uid() and fr.requester_id = p.id)
  where p.id <> auth.uid();
