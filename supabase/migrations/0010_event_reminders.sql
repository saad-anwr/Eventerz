-- ---------------------------------------------------------------------------
-- Eventerz — 0010: "starting soon" reminders
--
-- Run after 0009. Safe to re-run.
--
-- The mobile app schedules local notifications on the device, which is the
-- right mechanism there and wrong everywhere else: it fires only on the phone
-- that RSVP'd, only while the app is installed, and never for someone who
-- signed up on the website. A reminder that half the audience cannot receive
-- is not a reminder feature.
--
-- Doing it in the database instead of a Vercel cron route means one
-- implementation serves both clients, both of which already render
-- `notifications` and already stream that table over Realtime. A web-only cron
-- would have to be duplicated for the app, and a device-only scheduler cannot
-- reach the web.
--
-- Two windows, chosen because they answer different questions:
--   • **24 hours** — "is this still happening, and do I need to arrange
--     anything?" Late enough to be accurate, early enough to act on.
--   • **1 hour** — "leave now."
--
-- An event created three hours before it starts skips the 24-hour reminder
-- entirely rather than firing it immediately, which would be a reminder about
-- something the guest is already looking at.
-- ---------------------------------------------------------------------------

/* ===========================================================================
   1. What has already been sent
   ---------------------------------------------------------------------------
   The job is idempotent by construction: it inserts a claim row first, and the
   unique constraint is what stops a second send. Checking "did I already
   notify?" with a SELECT and then inserting is a race that duplicates every
   reminder the moment two workers overlap — and overlap is the normal state of
   a cron job whose previous run has not finished.
   =========================================================================== */

create table if not exists public.event_reminders (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  /** Which window this row claims: '24h' or '1h'. */
  reminder_window text not null check (reminder_window in ('24h', '1h')),
  sent_at    timestamptz not null default now(),
  primary key (event_id, profile_id, reminder_window)
);

create index if not exists event_reminders_sent_idx
  on public.event_reminders (sent_at desc);

alter table public.event_reminders enable row level security;

-- Bookkeeping, not content. Nobody reads it from a client; the job writes it
-- as the definer. With RLS on and no policy, a client sees an empty table.

/* ===========================================================================
   2. The job
   =========================================================================== */

/**
 * Send every reminder that is due, and record that it was sent.
 *
 * Returns how many notifications it wrote, so a manual run says something
 * useful and the cron log is not silent.
 *
 * Only confirmed guests are reminded. Someone still pending approval has not
 * been told they are coming, and "your event starts in an hour" would be the
 * app telling them they are in — a decision the host has not made.
 */
create or replace function public.send_event_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  written int := 0;
  batch   int;
begin
  /*
   * One statement per window. The CTE claims the reminder rows and the outer
   * INSERT notifies exactly the guests whose claim actually landed — so a
   * concurrent run that lost the race writes nothing rather than sending a
   * duplicate.
   */

  -- 24 hours out ------------------------------------------------------------
  with claimed as (
    insert into public.event_reminders (event_id, profile_id, reminder_window)
    select e.id, r.profile_id, '24h'
    from public.events e
    join public.rsvps r on r.event_id = e.id and r.status = 'confirmed'
    where e.cancelled_at is null
      and e.starts_at between now() + interval '23 hours'
                          and now() + interval '25 hours'
      /*
       * Don't remind someone about an event they RSVP'd to minutes ago.
       *
       * The window above already excludes events too close to start, but it says
       * nothing about *when the guest joined*. Someone who RSVPs to a
       * tomorrow-evening event at 18:01 would otherwise be told "this is
       * tomorrow" at 18:15 — a notification about something they are still
       * looking at, which is how people learn to ignore the ones that matter.
       */
      and r.created_at < now() - interval '1 hour'
    on conflict do nothing
    returning event_id, profile_id
  )
  insert into public.notifications (profile_id, kind, title, body, href)
  select
    c.profile_id, 'reminder',
    format('%s is tomorrow', e.title),
    /*
     * Literal words inside a `to_char` pattern must be double-quoted, or the
     * pattern matcher consumes them: an unquoted "at" is read as a format
     * template rather than the word, and the output is quietly wrong.
     */
    format('Starts %s · %s',
           to_char(e.starts_at at time zone 'UTC', 'Mon DD "at" HH24:MI') || ' UTC',
           case when e.is_online then 'Online' else e.location end),
    '/events/' || e.id
  from claimed c
  join public.events e on e.id = c.event_id;

  get diagnostics batch = row_count;
  written := written + batch;

  -- 1 hour out --------------------------------------------------------------
  with claimed as (
    insert into public.event_reminders (event_id, profile_id, reminder_window)
    select e.id, r.profile_id, '1h'
    from public.events e
    join public.rsvps r on r.event_id = e.id and r.status = 'confirmed'
    where e.cancelled_at is null
      and e.starts_at between now() + interval '45 minutes'
                          and now() + interval '75 minutes'
    on conflict do nothing
    returning event_id, profile_id
  )
  insert into public.notifications (profile_id, kind, title, body, href)
  select
    c.profile_id, 'reminder',
    format('%s starts soon', e.title),
    case when e.is_online
         then 'Starting in about an hour. Join from your tickets.'
         else format('Starting in about an hour at %s.', e.location) end,
    '/events/' || e.id
  from claimed c
  join public.events e on e.id = c.event_id;

  get diagnostics batch = row_count;
  written := written + batch;

  return written;
end;
$$;

revoke all on function public.send_event_reminders() from public, anon, authenticated;

/* ===========================================================================
   3. Schedule it
   ---------------------------------------------------------------------------
   Every 15 minutes. The windows above are ±1 hour and ±15 minutes wide, so a
   quarter-hourly run cannot miss one — and because the claim row is what makes
   the job idempotent, running it more often than necessary is harmless.
   =========================================================================== */

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice
    'pg_cron is unavailable (%). Reminders will not fire on a schedule. '
    'Enable it under Database → Extensions, then re-run this migration, or '
    'call public.send_event_reminders() from an external scheduler.',
    sqlerrm;
end $$;

do $$
begin
  -- Replace rather than duplicate: re-running this file must not leave two
  -- jobs racing each other.
  perform cron.unschedule('eventerz-event-reminders');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'eventerz-event-reminders',
    '*/15 * * * *',
    $cron$ select public.send_event_reminders(); $cron$
  );
exception when others then
  raise notice 'Could not schedule reminders (%). See the notice above.', sqlerrm;
end $$;

/* ===========================================================================
   4. Housekeeping
   ---------------------------------------------------------------------------
   Claim rows are only useful until the event has happened. Left alone the
   table grows with every guest of every past event forever, to answer a
   question nobody asks after the fact.
   =========================================================================== */

create or replace function public.prune_event_reminders()
returns int
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.event_reminders er
    using public.events e
    where e.id = er.event_id
      and coalesce(e.ends_at, e.starts_at) < now() - interval '7 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke all on function public.prune_event_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('eventerz-prune-reminders');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'eventerz-prune-reminders',
    '30 4 * * *',
    $cron$ select public.prune_event_reminders(); $cron$
  );
exception when others then null;
end $$;
