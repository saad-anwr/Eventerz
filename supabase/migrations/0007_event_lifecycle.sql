-- ---------------------------------------------------------------------------
-- Eventerz - 0006: event editing and cancellation
--
-- Run after 0005. Safe to re-run.
--
-- Until now an event was write-once from the product's point of view: the host
-- could technically UPDATE it (the "events host writes" policy is `for all`),
-- but nothing told the guests. A host who moved the venue, pushed the start
-- time or called the whole thing off had no way to say so, and forty people
-- turned up at the old address.
--
-- Two functions, both host-only and both SECURITY DEFINER:
--
--   • `update_event()`   - edits the mutable fields and notifies live guests
--                          when something they actually care about changed.
--   • `cancel_event()`   - soft-cancels. The row stays so ticket holders keep
--                          a record and the URL keeps resolving; every live
--                          RSVP is closed and everyone is told.
--
-- Why a function rather than letting the client UPDATE directly, when RLS
-- already restricts writes to the host:
--
--   1. RLS controls *which rows* a host may touch, never *which columns* or
--      *which values*. A direct UPDATE lets a host rewrite `confirmed_count`
--      to 500 or set `host_id` to someone else. The function writes a fixed
--      column list.
--   2. Notifying guests has to happen in the same transaction as the edit.
--      Doing it client-side means an edit that lands with nobody told,
--      whenever the tab is closed between the two calls.
--   3. Lowering capacity below the headcount has to be a decision, not a
--      silent corruption. The function refuses it.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. Cancellation state
   ---------------------------------------------------------------------------
   A cancelled event is not a deleted one. Ticket holders still need the
   record, and a dead link where an event used to be is a worse answer than a
   page that says it was called off.
   =========================================================================== */

alter table public.events
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancel_reason   text;

comment on column public.events.cancelled_at is
  'Set when the host calls the event off. The row is kept so ticket holders retain the record and the URL still resolves.';

create index if not exists events_cancelled_idx
  on public.events (cancelled_at)
  where cancelled_at is not null;

/* ===========================================================================
   2. Editing
   =========================================================================== */

/**
 * Edit an event. Host only.
 *
 * Every parameter defaults to null and null means "leave alone", so a caller
 * sends only the fields it is actually changing. That matters for concurrent
 * edits from two devices: a full-row write would clobber the other device's
 * change with a stale value it never intended to send.
 *
 * `p_ends_at` is the exception - an event can legitimately have its end time
 * removed, so `p_clear_ends_at` distinguishes "unchanged" from "cleared".
 */
create or replace function public.update_event(
  p_event_id          uuid,
  p_title             text    default null,
  p_description       text    default null,
  p_category          text    default null,
  p_starts_at         timestamptz default null,
  p_ends_at           timestamptz default null,
  p_clear_ends_at     boolean default false,
  p_location          text    default null,
  p_is_online         boolean default null,
  p_capacity          int     default null,
  p_price             text    default null,
  p_visibility        text    default null,
  p_requires_approval boolean default null,
  p_tags              text[]  default null,
  p_cover_gradient    text    default null,
  p_cover_image       text    default null,
  p_latitude          double precision default null,
  p_longitude         double precision default null,
  p_place_id          text    default null,
  p_address           text    default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  me        uuid := auth.uid();
  ev        public.events;
  result    public.events;
  moved     boolean;
  retimed   boolean;
  headcount int;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  if ev.host_id <> me then
    raise exception 'Only the host can edit this event.' using errcode = '42501';
  end if;
  if ev.cancelled_at is not null then
    raise exception 'This event was cancelled and can no longer be edited.'
      using errcode = '22023';
  end if;

  /*
   * Capacity may be raised freely and lowered only to the current headcount.
   * Going below it would leave more confirmed guests than seats - the counts
   * would read "45 / 30 going" and `approve_guest` would start refusing for a
   * reason the host never chose.
   */
  if p_capacity is not null and p_capacity <> ev.capacity then
    select count(*) into headcount from public.rsvps
    where event_id = p_event_id and status = 'confirmed';

    if p_capacity < headcount then
      raise exception
        'You already have % confirmed guests. Remove some before lowering capacity to %.',
        headcount, p_capacity
        using errcode = '23514';
    end if;
  end if;

  -- What changed, decided before the write while both values are in hand.
  moved := (p_location is not null and p_location is distinct from ev.location)
        or (p_is_online is not null and p_is_online is distinct from ev.is_online);
  retimed := (p_starts_at is not null and p_starts_at is distinct from ev.starts_at);

  update public.events set
    title             = coalesce(p_title, title),
    description       = coalesce(p_description, description),
    category          = coalesce(p_category::event_category, category),
    starts_at         = coalesce(p_starts_at, starts_at),
    ends_at           = case when p_clear_ends_at then null
                             else coalesce(p_ends_at, ends_at) end,
    location          = coalesce(p_location, location),
    is_online         = coalesce(p_is_online, is_online),
    capacity          = coalesce(p_capacity, capacity),
    price             = coalesce(p_price, price),
    visibility        = coalesce(p_visibility::event_visibility, visibility),
    requires_approval = coalesce(p_requires_approval, requires_approval),
    tags              = coalesce(p_tags, tags),
    cover_gradient    = coalesce(p_cover_gradient, cover_gradient),
    cover_image       = coalesce(p_cover_image, cover_image),
    latitude          = coalesce(p_latitude, latitude),
    longitude         = coalesce(p_longitude, longitude),
    place_id          = coalesce(p_place_id, place_id),
    address           = coalesce(p_address, address)
  where id = p_event_id
  returning * into result;

  /*
   * Only a move or a time change is worth a notification. Fixing a typo in the
   * description should not push a notification to two hundred people - an alert
   * that fires for nothing trains everyone to ignore the ones that matter.
   */
  if moved or retimed then
    insert into public.notifications (profile_id, kind, title, body, href)
    select
      r.profile_id,
      'event',
      case when retimed then 'Event time changed' else 'Event location changed' end,
      case
        when retimed and moved then
          format('%s has moved to %s and now starts %s.',
                 result.title, result.location,
                 to_char(result.starts_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC')
        when retimed then
          format('%s now starts %s.', result.title,
                 to_char(result.starts_at at time zone 'UTC', 'Mon DD, HH24:MI') || ' UTC')
        else
          format('%s has moved to %s.', result.title, result.location)
      end,
      '/events/' || p_event_id
    from public.rsvps r
    where r.event_id = p_event_id
      and r.status in ('confirmed', 'pending', 'waitlist');
  end if;

  return result;
end;
$$;

revoke all on function public.update_event(
  uuid, text, text, text, timestamptz, timestamptz, boolean, text, boolean,
  int, text, text, boolean, text[], text, text,
  double precision, double precision, text, text
) from public;
grant execute on function public.update_event(
  uuid, text, text, text, timestamptz, timestamptz, boolean, text, boolean,
  int, text, text, boolean, text[], text, text,
  double precision, double precision, text, text
) to authenticated;

/* ===========================================================================
   3. Cancellation
   =========================================================================== */

/**
 * Call an event off. Host only.
 *
 * Soft, not a DELETE. Deleting cascades to `rsvps` and `tickets`, which would
 * erase the attendance record of everyone who already checked in - the exact
 * history the product exists to keep. The row stays, marked, and every live
 * RSVP is closed so it stops appearing under "my events" as if it were still
 * happening.
 *
 * Guests are moved to `cancelled` rather than `declined`: `declined` means the
 * host rejected that person, and telling forty people they were individually
 * turned down is the wrong story.
 */
create or replace function public.cancel_event(
  p_event_id uuid,
  p_reason   text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  ev     public.events;
  result public.events;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  if ev.host_id <> me then
    raise exception 'Only the host can cancel this event.' using errcode = '42501';
  end if;
  if ev.cancelled_at is not null then
    return ev;  -- Idempotent: cancelling twice is not an error.
  end if;

  update public.events
  set cancelled_at = now(),
      cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_event_id
  returning * into result;

  -- Tell everyone who was counting on it, before their rows are closed.
  insert into public.notifications (profile_id, kind, title, body, href)
  select
    r.profile_id,
    'event',
    'Event cancelled',
    case
      when result.cancel_reason is not null
        then format('%s has been cancelled. %s', result.title, result.cancel_reason)
      else format('%s has been cancelled by the host.', result.title)
    end,
    '/events/' || p_event_id
  from public.rsvps r
  where r.event_id = p_event_id
    and r.status in ('confirmed', 'pending', 'waitlist');

  update public.rsvps set status = 'cancelled'
  where event_id = p_event_id
    and status in ('confirmed', 'pending', 'waitlist');

  -- The tickets go with the event. `checked_in_at` survives on nothing here,
  -- but a valid ticket to an event that is not happening is worse than none.
  delete from public.tickets
  where event_id = p_event_id and status <> 'used';

  return result;
end;
$$;

revoke all on function public.cancel_event(uuid, text) from public;
grant execute on function public.cancel_event(uuid, text) to authenticated;

/* ===========================================================================
   4. A cancelled event stops accepting guests
   ---------------------------------------------------------------------------
   `request_to_join` is redefined here rather than in 0005 so the check lives
   next to the column it reads. Everything else about it is unchanged from
   0005 - see that file for why capacity counts confirmed guests only and why
   a live RSVP is idempotent.
   =========================================================================== */

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

  select * into ev from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;

  if ev.host_id = me then
    raise exception 'You are hosting this event.' using errcode = '22023';
  end if;

  if ev.cancelled_at is not null then
    raise exception 'This event has been cancelled.' using errcode = '22023';
  end if;

  if coalesce(ev.ends_at, ev.starts_at) < now() then
    raise exception 'This event has already ended.' using errcode = '22023';
  end if;

  select wallet_address into my_wallet from public.profiles where id = me;

  select * into result from public.rsvps
  where event_id = p_event_id and profile_id = me;

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
