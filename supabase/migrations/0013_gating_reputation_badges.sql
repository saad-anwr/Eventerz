-- ---------------------------------------------------------------------------
-- Eventerz - 0013: token gating, derived reputation, proof-of-attendance
--
-- Run after 0012. Safe to re-run.
--
-- What was wrong
-- --------------
-- The landing page has always sold four things the product did not do:
-- token-gated events, portable reputation, compressed-NFT tickets and
-- proof-of-attendance badges. Three of the four had a *column* and nothing
-- behind it:
--
--   * `events.token_gated` was a boolean nobody read, and `gate_requirement`
--     was free text ("1 BONK", "any Mad Lad") that no code could evaluate.
--     `request_to_join` never looked at either, so a "token-gated" event
--     admitted anyone who clicked.
--   * `profiles.reputation` defaulted to 0 and was never written by anything.
--     Every profile in production reads 0, and the dashboard renders it.
--   * `tickets.asset_id` was reserved for a cNFT mint that had no code path.
--
-- A column that is never enforced is worse than a missing feature: the UI
-- renders a padlock, the host believes the event is restricted, and it is not.
--
-- The fix
-- -------
-- 1. **Gating becomes structured and fail-closed.** `gate_requirement` stays
--    for display, but the decision now reads `gate_mint` + `gate_min_amount`,
--    which are machine-checkable. `request_to_join` **refuses outright** on a
--    gated event, because Postgres cannot check a token balance - it makes no
--    outbound RPC calls. The only way in is the `check-gate` Edge Function,
--    which reads the holder's balance from the cluster and then calls
--    `request_to_join_verified` with the service-role key.
--
--    This is the same shape as 0011's wallet linking, for the same reason: the
--    check that matters cannot run where the data lives, so the entry point
--    that skips it is revoked rather than left as a fallback. A gate with a
--    fallback is not a gate.
--
-- 2. **Reputation is derived, never written by a client.** It is a pure
--    function of check-ins and hosted events, recomputed by trigger. There is
--    no grant that lets `authenticated` write the column, so it cannot be
--    inflated by anyone - including the profile's owner.
--
--    The trigger does a **full recount** per affected profile rather than an
--    incremental +10, following 0005's counter triggers: ticket status moves
--    between any two values, and a recount is self-healing where an increment
--    accumulates drift that nothing ever corrects.
--
-- 3. **Proof-of-attendance becomes a row at check-in, not a mint.** A badge is
--    recorded the moment the host attests attendance, with `asset_id` null
--    until a cNFT lands - exactly how `tickets.asset_id` already works. The
--    record is the fact; the mint is a representation of it. Tying the fact to
--    a successful mint would mean a failed Bubblegum call erases an attendance
--    that actually happened.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Structured gate columns
-- ---------------------------------------------------------------------------

alter table public.events
  -- The SPL mint the guest must hold, or 'native' for plain SOL. Null when the
  -- event is not gated.
  add column if not exists gate_mint text,

  -- Minimum balance in **base units** (lamports, or the token's smallest unit).
  -- numeric(40,0) rather than bigint: an SPL mint may have up to 9 decimals on
  -- a supply that already exceeds 2^63, and money is never a float here.
  add column if not exists gate_min_amount numeric(40, 0),

  -- Display only. Deriving these needs a mint account read, which Postgres
  -- cannot do, so the Edge Function writes them once at create time.
  add column if not exists gate_decimals smallint,
  add column if not exists gate_symbol text;

-- `token_gated` is the flag the UI already renders. Keep it honest: it is true
-- exactly when a machine-checkable requirement exists. A padlock that does not
-- imply an enforced rule is the bug this migration exists to remove.
alter table public.events
  drop constraint if exists events_gate_is_checkable;

alter table public.events
  add constraint events_gate_is_checkable check (
    (token_gated = false)
    or (gate_mint is not null and gate_min_amount is not null and gate_min_amount > 0)
  ) not valid;

-- `not valid` above, then validate separately: existing rows may have
-- token_gated = true with no structured requirement (the seed data does), and
-- a plain ADD CONSTRAINT would fail the whole migration on them. Clear those
-- first, then validate.
update public.events
set token_gated = false
where token_gated = true
  and (gate_mint is null or gate_min_amount is null or gate_min_amount <= 0);

alter table public.events validate constraint events_gate_is_checkable;

comment on column public.events.gate_mint is
  'SPL mint address the guest must hold, or ''native'' for SOL. Checked by the check-gate Edge Function - never by Postgres, which cannot read a balance.';

-- ---------------------------------------------------------------------------
-- 2. Proof-of-attendance badges
-- ---------------------------------------------------------------------------

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,

  -- Null until a compressed NFT is minted for it. The badge is real either
  -- way; the asset id is how it is represented on-chain.
  asset_id text unique,

  awarded_at timestamptz not null default now(),
  minted_at  timestamptz,

  -- One badge per person per event. Attending twice is not a thing.
  unique (profile_id, event_id)
);

create index if not exists badges_profile_idx on public.badges (profile_id);
create index if not exists badges_event_idx   on public.badges (event_id);

alter table public.badges enable row level security;

-- Read-only to clients, and only your own badges plus the ones you awarded as
-- host. Badges are attendance records, and a public badge table would publish
-- who was where - which the guest-list rules in 0005 deliberately do not.
drop policy if exists "badges: owner or host reads" on public.badges;
create policy "badges: owner or host reads" on public.badges
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = badges.event_id and e.host_id = auth.uid()
    )
  );

-- No insert/update/delete policies at all. Badges are written by the check-in
-- trigger and by `record_badge_mint`, both SECURITY DEFINER. Following 0005's
-- rule for `rsvps`: RLS restricts which rows you may touch, never which values
-- you may set, so the only safe client write is none.

-- ---------------------------------------------------------------------------
-- 3. Reputation, derived
-- ---------------------------------------------------------------------------

-- The formula, stated once so it is not reinvented per caller:
--
--   10 points  per event attended  (a ticket the host actually scanned)
--    5 points  per event hosted    (that had at least one attendee scanned)
--
-- Attendance outweighs hosting because attendance is attested by someone else,
-- while hosting is self-declared - anyone can create an event. Hosting scores
-- at all only when somebody turned up, so an empty event registry earns
-- nothing.
create or replace function public.recompute_reputation(p_profile_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  with attended as (
    select count(*) as n
    from public.tickets
    where owner_id = p_profile_id and status = 'used'
  ),
  hosted as (
    select count(distinct e.id) as n
    from public.events e
    join public.tickets t on t.event_id = e.id and t.status = 'used'
    where e.host_id = p_profile_id
  )
  update public.profiles p
  set reputation = (select n from attended) * 10 + (select n from hosted) * 5,
      updated_at = now()
  where p.id = p_profile_id
  returning p.reputation;
$$;

revoke all on function public.recompute_reputation(uuid) from public, anon, authenticated;

-- Recount both sides of a check-in: the attendee, and the host whose hosted
-- count may have just crossed from zero.
create or replace function public.tickets_reputation_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
  host     uuid;
begin
  affected := coalesce(new.owner_id, old.owner_id);
  perform public.recompute_reputation(affected);

  select host_id into host from public.events
  where id = coalesce(new.event_id, old.event_id);

  -- Skip the second recount when the host is the attendee; recomputing the
  -- same row twice is harmless but the guard makes the intent readable.
  if host is not null and host <> affected then
    perform public.recompute_reputation(host);
  end if;

  return null;
end;
$$;

drop trigger if exists tickets_reputation_sync on public.tickets;
create trigger tickets_reputation_sync
  after insert or update of status or delete on public.tickets
  for each row execute function public.tickets_reputation_sync();

-- Award the proof-of-attendance badge in the same transaction as the check-in.
-- Not a separate job: a badge that arrives later is a badge that can be missing
-- when the guest opens the app on the way out of the venue.
create or replace function public.tickets_badge_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'used' and (old.status is distinct from 'used') then
    insert into public.badges (profile_id, event_id)
    values (new.owner_id, new.event_id)
    on conflict (profile_id, event_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists tickets_badge_on_checkin on public.tickets;
create trigger tickets_badge_on_checkin
  after update of status on public.tickets
  for each row execute function public.tickets_badge_on_checkin();

-- Backfill: every existing check-in should already have a badge and a score.
insert into public.badges (profile_id, event_id, awarded_at)
select t.owner_id, t.event_id, coalesce(t.checked_in_at, now())
from public.tickets t
where t.status = 'used'
on conflict (profile_id, event_id) do nothing;

select public.recompute_reputation(id) from public.profiles;

-- ---------------------------------------------------------------------------
-- 4. Recording a mint (tickets and badges)
-- ---------------------------------------------------------------------------

-- Called by the mint path with the service-role key once Bubblegum returns an
-- asset id. Separate from the mint itself so a client can never claim one:
-- writing `asset_id` is writing "this exists on-chain", and only something that
-- watched the transaction land may say so.
create or replace function public.record_ticket_mint(
  p_ticket_id uuid,
  p_asset_id  text
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.tickets;
begin
  if p_asset_id is null or length(trim(p_asset_id)) = 0 then
    raise exception 'An asset id is required.' using errcode = '22023';
  end if;

  -- Idempotent on the asset id: a retried mint records exactly once, so the
  -- safe failure mode of "minted, then lost the response" is a second call.
  update public.tickets
  set asset_id = p_asset_id,
      minted_at = now()
  where id = p_ticket_id
    and (asset_id is null or asset_id = p_asset_id)
  returning * into result;

  if not found then
    raise exception 'Ticket not found, or already minted as a different asset.'
      using errcode = '22023';
  end if;

  return result;
end;
$$;

revoke all on function public.record_ticket_mint(uuid, text) from public, anon, authenticated;

create or replace function public.record_badge_mint(
  p_badge_id uuid,
  p_asset_id text
)
returns public.badges
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.badges;
begin
  if p_asset_id is null or length(trim(p_asset_id)) = 0 then
    raise exception 'An asset id is required.' using errcode = '22023';
  end if;

  update public.badges
  set asset_id = p_asset_id,
      minted_at = now()
  where id = p_badge_id
    and (asset_id is null or asset_id = p_asset_id)
  returning * into result;

  if not found then
    raise exception 'Badge not found, or already minted as a different asset.'
      using errcode = '22023';
  end if;

  return result;
end;
$$;

revoke all on function public.record_badge_mint(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Joining: the gate, and the one door through it
-- ---------------------------------------------------------------------------

-- The seat-granting body, extracted verbatim from 0005's `request_to_join` so
-- both entry points share one implementation. Revoked from everyone: it takes
-- a profile id rather than reading `auth.uid()`, so a direct grant would let
-- any caller RSVP as anybody.
create or replace function public.join_event_internal(
  p_event_id   uuid,
  p_profile_id uuid
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  ev          public.events;
  confirmed   int;
  my_wallet   text;
  next_serial int;
  new_status  rsvp_status;
  result      public.rsvps;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;

  if ev.host_id = p_profile_id then
    raise exception 'You are hosting this event.' using errcode = '22023';
  end if;

  if ev.cancelled_at is not null then
    raise exception 'This event has been cancelled.' using errcode = '22023';
  end if;

  if coalesce(ev.ends_at, ev.starts_at) < now() then
    raise exception 'This event has already ended.' using errcode = '22023';
  end if;

  select wallet_address into my_wallet from public.profiles where id = p_profile_id;

  select * into result from public.rsvps
  where event_id = p_event_id and profile_id = p_profile_id;

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
  values (p_event_id, p_profile_id, new_status, my_wallet)
  on conflict (event_id, profile_id) do update
    set status = excluded.status,
        wallet_address = coalesce(excluded.wallet_address, public.rsvps.wallet_address)
  returning * into result;

  if new_status = 'confirmed' then
    select coalesce(max(serial), 0) + 1 into next_serial
    from public.tickets where event_id = p_event_id;

    insert into public.tickets (event_id, owner_id, serial, soulbound)
    values (p_event_id, p_profile_id, next_serial, ev.token_gated)
    on conflict (event_id, owner_id) do nothing;
  end if;

  if new_status = 'pending' then
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      ev.host_id, 'rsvp', 'New request to join',
      format('%s asked to attend %s.',
             (select coalesce(name, 'Someone') from public.profiles where id = p_profile_id),
             ev.title),
      '/events/' || p_event_id
    );
  elsif new_status = 'waitlist' then
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      p_profile_id, 'rsvp', 'You are on the waitlist',
      format('%s is full. You will be let in automatically if a spot opens.', ev.title),
      '/events/' || p_event_id
    );
  else
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      p_profile_id, 'ticket', 'You are going',
      format('Your spot at %s is confirmed.', ev.title),
      '/events/' || p_event_id
    );
  end if;

  return result;
end;
$$;

revoke all on function public.join_event_internal(uuid, uuid) from public, anon, authenticated;

-- The ordinary door. Refuses gated events rather than silently admitting - the
-- behaviour the padlock always implied.
create or replace function public.request_to_join(p_event_id uuid)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  is_gated boolean;
begin
  if me is null then
    raise exception 'Sign in to RSVP.' using errcode = '28000';
  end if;

  select token_gated into is_gated from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;

  -- Fail closed. Postgres cannot read a token balance, so this path has no way
  -- to satisfy the requirement and must not pretend otherwise. The client is
  -- expected to call the `check-gate` Edge Function for these events; the
  -- errcode is distinct so the UI can route rather than show a dead error.
  if is_gated then
    raise exception 'This event is token-gated. Verify your holdings to join.'
      using errcode = 'P0001';
  end if;

  return public.join_event_internal(p_event_id, me);
end;
$$;

revoke all on function public.request_to_join(uuid) from public, anon;
grant execute on function public.request_to_join(uuid) to authenticated;

-- The gated door. Reachable only with the service-role key, which lives in the
-- `check-gate` Edge Function and nowhere else. By the time this is called the
-- balance has already been read from the cluster.
create or replace function public.request_to_join_verified(
  p_event_id   uuid,
  p_profile_id uuid
)
returns public.rsvps
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.join_event_internal(p_event_id, p_profile_id);
end;
$$;

revoke all on function public.request_to_join_verified(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reading a gate requirement
-- ---------------------------------------------------------------------------

-- What the client needs to render "Hold 1 BONK to join" and to know which mint
-- to check. Deliberately readable by anyone who can see the event: the
-- requirement is the advertisement, not a secret.
create or replace function public.event_gate(p_event_id uuid)
returns table (
  token_gated     boolean,
  gate_mint       text,
  gate_min_amount text,
  gate_decimals   smallint,
  gate_symbol     text,
  gate_requirement text
)
language sql
stable
security invoker
set search_path = public
as $$
  -- gate_min_amount leaves as text: it is up to 40 digits and PostgREST would
  -- hand a JS client a lossy Number for anything past 2^53.
  select e.token_gated,
         e.gate_mint,
         e.gate_min_amount::text,
         e.gate_decimals,
         e.gate_symbol,
         e.gate_requirement
  from public.events e
  where e.id = p_event_id;
$$;

grant execute on function public.event_gate(uuid) to anon, authenticated;
