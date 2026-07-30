-- ---------------------------------------------------------------------------
-- Eventerz — 0008: waitlist position
--
-- Run after 0007. Safe to re-run.
--
-- "On the waitlist" is not actionable on its own. Third in line means stay
-- free that evening; fortieth means make other plans. The guest has no way to
-- tell which they are, and the difference is the whole decision.
--
-- The number cannot be computed client-side. RLS (0005) returns a waitlisted
-- guest exactly one row — their own — so counting the people ahead of them is
-- counting rows they are not allowed to see. Hence a SECURITY DEFINER
-- function, which is the same reason `event_guest_preview` exists.
--
-- What it deliberately does not expose: *who* is ahead of you, and any
-- position other than your own. A caller gets one integer about themselves.
-- ---------------------------------------------------------------------------

/**
 * The caller's place in the queue for one event, 1-based.
 *
 * Null when the caller is not waitlisted — which reads correctly at every call
 * site, because "no position" and "position 0" are different facts and only
 * one of them is true for a confirmed guest.
 *
 * Ordered by `created_at`, matching `promote_from_waitlist` exactly. If the
 * two ever disagreed the app would promise a seat to the wrong person, so the
 * ordering is the contract between them and not an implementation detail.
 */
create or replace function public.my_waitlist_position(p_event_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select ranked.queue_position from (
    select
      w.profile_id,
      row_number() over (order by w.created_at, w.profile_id)::int as queue_position
    from public.rsvps w
    where w.event_id = p_event_id and w.status = 'waitlist'
  ) ranked
  where ranked.profile_id = (select auth.uid());
$$;

grant execute on function public.my_waitlist_position(uuid) to authenticated;

/**
 * The same answer for many events at once.
 *
 * The "my events" list shows a status pill per row. One call per waitlisted
 * event is an N+1 that grows with how patient the user is, which is a strange
 * thing to punish. This returns only the events where the caller actually
 * holds a waitlist place, so the result is usually empty and never larger than
 * the input.
 */
/*
 * Every column reference below is table-qualified, deliberately. A RETURNS
 * TABLE column is also an in-scope parameter name inside the body, so a bare
 * `event_id` matches both the output parameter and `rsvps.event_id` and
 * Postgres refuses the whole function with "column reference is ambiguous" —
 * at CREATE time if you are lucky, and it is easy to write it the ambiguous way
 * without noticing.
 */
create or replace function public.my_waitlist_positions(p_event_ids uuid[])
returns table (event_id uuid, queue_position int)
language sql
security definer
stable
set search_path = public
as $$
  select ranked.event_id, ranked.queue_position
  from (
    select
      w.event_id,
      w.profile_id,
      row_number() over (
        partition by w.event_id order by w.created_at, w.profile_id
      )::int as queue_position
    from public.rsvps w
    where w.event_id = any(p_event_ids) and w.status = 'waitlist'
  ) ranked
  where ranked.profile_id = (select auth.uid());
$$;

grant execute on function public.my_waitlist_positions(uuid[]) to authenticated;

/* ===========================================================================
   Keep the guest informed as the queue moves
   ---------------------------------------------------------------------------
   Reaching the front of the queue is worth knowing about: it is the moment
   "probably not" becomes "keep the evening free". `promote_from_waitlist`
   already notifies the person who got in; this notifies whoever is now next.
   =========================================================================== */

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
  now_first   uuid;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return; end if;

  -- A cancelled event has no seats to free (0007).
  if ev.cancelled_at is not null then return; end if;

  select count(*) into confirmed from public.rsvps
  where event_id = p_event_id and status = 'confirmed';
  if confirmed >= ev.capacity then return; end if;

  select profile_id into nxt from public.rsvps
  where event_id = p_event_id and status = 'waitlist'
  order by created_at, profile_id
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
  else
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
  end if;

  /*
   * Whoever inherited first place is told, once. Notifying the whole queue
   * on every movement would send the fortieth person forty notifications to
   * say they are still fortieth.
   */
  select profile_id into now_first from public.rsvps
  where event_id = p_event_id and status = 'waitlist'
  order by created_at, profile_id
  limit 1;

  if now_first is not null then
    insert into public.notifications (profile_id, kind, title, body, href)
    values (
      now_first, 'rsvp', 'You are next on the waitlist',
      format('You are first in line for %s. You will be let in as soon as a spot opens.',
             ev.title),
      '/events/' || p_event_id
    );
  end if;
end;
$$;

grant execute on function public.promote_from_waitlist(uuid) to authenticated;
