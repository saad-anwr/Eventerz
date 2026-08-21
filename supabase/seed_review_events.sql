-- Review/launch seed: five upcoming events.
--
-- # Why this exists
--
-- The dApp Store reviewer installs the app and lands on Home. With no upcoming
-- events, every surface that matters is an empty state: Home says "Nothing on
-- the calendar", Discover says "0 events", and RSVP, tickets, check-in, the
-- guest list and event chat are all unreachable because there is nothing to
-- reach them through. An app with no content is not a reviewable app, and
-- "we could not review it" is how this submission has already been rejected
-- once.
--
-- # Why the dates are relative
--
-- Every `starts_at` is `now() + interval`, not a literal timestamp. A review
-- can sit in a queue for two weeks; hard-coded dates that were upcoming when
-- the script ran would be in the past by the time anyone looked, putting the
-- app straight back into the empty state this script exists to fix. Relative
-- dates mean re-running the script re-freshens the calendar, and running it
-- the day before a submission needs no edits.
--
-- # Safe to re-run
--
-- Fixed UUIDs plus `on conflict (id) do update`, so this is idempotent: it
-- refreshes the five rows rather than accumulating duplicates every time it
-- runs. The counts (`confirmed_count` and friends) are deliberately not set -
-- they are maintained by trigger with a full recount, and writing them by hand
-- would put a number on screen that no RSVP row supports.
--
-- # These are real rows
--
-- They are hosted by a real profile and are visible to real users, who can RSVP
-- to them. Either intend to run them, or delete them once the app is approved:
--
--   delete from public.events where id in (
--     '3f1a7c20-0000-4000-8000-000000000001',
--     '3f1a7c20-0000-4000-8000-000000000002',
--     '3f1a7c20-0000-4000-8000-000000000003',
--     '3f1a7c20-0000-4000-8000-000000000004',
--     '3f1a7c20-0000-4000-8000-000000000005'
--   );

do $$
declare
  host uuid;
  /*
   * Midnight tonight in Delhi, as the base every start time is offset from.
   *
   * The first cut of this script added intervals to `now()` directly, which
   * carried the current minutes and seconds through: events landed at 3:01 PM
   * and 5:31 AM. Nobody schedules a meetup at 3:01, and content that is
   * obviously machine-generated is content a reviewer reads as filler.
   *
   * Truncating in `Asia/Kolkata` rather than UTC because these are Delhi
   * events - a clean UTC hour is 5:30 past the hour locally, which is the same
   * problem wearing a different timezone.
   */
  ist_midnight timestamp := date_trunc('day', now() at time zone 'Asia/Kolkata');
begin
  -- Prefer the project owner's profile; fall back to the oldest one that
  -- exists so this still runs on a database where that handle was renamed.
  select id into host from public.profiles where handle = 'saadanwar' limit 1;
  if host is null then
    select id into host from public.profiles order by created_at asc limit 1;
  end if;
  if host is null then
    raise exception 'No profile to host these events. Create an account first.';
  end if;

  insert into public.events (
    id, title, description, host_id, category, cover_gradient,
    starts_at, ends_at, location, address, latitude, longitude,
    is_online, capacity, price, visibility, requires_approval, tags
  ) values
    -- Free, in person, no approval: the simplest possible RSVP path, and the
    -- one a reviewer should hit first.
    (
      '3f1a7c20-0000-4000-8000-000000000001',
      'Solana Delhi Builders Meetup',
      E'An evening for people building on Solana in Delhi NCR.\n\nLightning talks from local builders, then open floor. Bring a laptop if you want to demo something - we keep the last hour for whoever wants to show what they are working on.\n\nNew to Solana? Come anyway. Roughly half the room usually is.',
      host, 'Meetup', 'purple-blue',
      (ist_midnight + interval '4 days 19 hours') at time zone 'Asia/Kolkata',
      (ist_midnight + interval '4 days 22 hours') at time zone 'Asia/Kolkata',
      'Innov8 Connaught Place, New Delhi',
      'Innov8, 44 Regal Building, Connaught Place, New Delhi 110001',
      28.6304, 77.2177,
      false, 80, 'Free', 'public', false,
      array['solana','delhi','builders','meetup']
    ),
    -- Online + AMA: exercises the online branch, where the map card and
    -- directions must correctly not appear.
    (
      '3f1a7c20-0000-4000-8000-000000000002',
      'Eventerz Community AMA',
      E'Open call with the Eventerz team.\n\nWe walk through what shipped this month, then answer whatever you ask - roadmap, on-chain ticketing, reputation, or why we made a particular call. Questions can be sent ahead in the event chat.',
      host, 'AMA', 'blue-cyan',
      (ist_midnight + interval '2 days 20 hours') at time zone 'Asia/Kolkata',
      (ist_midnight + interval '2 days 21 hours') at time zone 'Asia/Kolkata',
      'Online', null, null, null,
      true, 300, 'Free', 'public', false,
      array['ama','community','online']
    ),
    -- Workshop with a small capacity: makes the capacity/"spots left" UI real.
    (
      '3f1a7c20-0000-4000-8000-000000000003',
      'Seeker Workshop: Mobile Wallet Adapter',
      E'A hands-on session on building for the Solana Seeker.\n\nWe go from an empty React Native project to a working Mobile Wallet Adapter connection, cover the Android package-visibility trap that silently breaks wallet discovery, and finish on signing and sending a real transaction.\n\nBring an Android device if you have one. Emulators work too.',
      host, 'Workshop', 'cyan-green',
      (ist_midnight + interval '8 days 11 hours') at time zone 'Asia/Kolkata',
      (ist_midnight + interval '8 days 14 hours') at time zone 'Asia/Kolkata',
      'WeWork Berger Delhi One, Noida',
      'WeWork Berger Delhi One, Sector 16B, Noida 201301',
      28.5708, 77.3260,
      false, 40, 'Free', 'public', false,
      array['seeker','mobile','workshop','dev']
    ),
    -- Approval-gated: the request -> pending -> approved path, and the only
    -- way to see the "Requested to attend" state.
    (
      '3f1a7c20-0000-4000-8000-000000000004',
      'Superteam India Hackathon Kickoff',
      E'Kickoff for the next Superteam India hackathon cycle.\n\nTracks, prizes and judging criteria, followed by team formation for anyone still looking. Approval is on so we can keep the room to people actually intending to ship - say a line about what you want to build when you request.',
      host, 'Hackathon', 'fuchsia-purple',
      (ist_midnight + interval '13 days 10 hours') at time zone 'Asia/Kolkata',
      (ist_midnight + interval '13 days 19 hours') at time zone 'Asia/Kolkata',
      'Superteam House, Gurugram',
      'Superteam House, Sector 44, Gurugram 122003',
      28.4529, 77.0783,
      false, 150, 'Free', 'public', true,
      array['hackathon','superteam','india']
    ),
    -- Paid + approval + tight capacity: the one that shows a price on the card
    -- and in the RSVP bar.
    (
      '3f1a7c20-0000-4000-8000-000000000005',
      'Web3 Founders Dinner',
      E'A small dinner for founders building in web3, capped at one table.\n\nNo talks and no pitching - it is a dinner. Approval is on because the table is the point; the ticket covers the meal and settles straight to the host wallet.',
      host, 'Party', 'violet-purple',
      (ist_midnight + interval '19 days 20 hours') at time zone 'Asia/Kolkata',
      (ist_midnight + interval '19 days 23 hours') at time zone 'Asia/Kolkata',
      'Olive Bar & Kitchen, Mehrauli',
      'Olive Bar & Kitchen, One Style Mile, Mehrauli, New Delhi 110030',
      28.5183, 77.1772,
      false, 25, '0.35 SOL', 'public', true,
      array['founders','dinner','web3']
    )
  on conflict (id) do update set
    title             = excluded.title,
    description       = excluded.description,
    host_id           = excluded.host_id,
    category          = excluded.category,
    cover_gradient    = excluded.cover_gradient,
    starts_at         = excluded.starts_at,
    ends_at           = excluded.ends_at,
    location          = excluded.location,
    address           = excluded.address,
    latitude          = excluded.latitude,
    longitude         = excluded.longitude,
    is_online         = excluded.is_online,
    capacity          = excluded.capacity,
    price             = excluded.price,
    visibility        = excluded.visibility,
    requires_approval = excluded.requires_approval,
    tags              = excluded.tags,
    -- Re-running is a refresh, so an event previously cancelled comes back.
    cancelled_at      = null,
    cancel_reason     = null,
    updated_at        = now();

  raise notice 'Seeded 5 upcoming events, hosted by profile %', host;
end $$;

-- What the app will now show. Times rendered in IST, which is both where these
-- events are and the only way to eyeball that they land on a sane hour.
select title,
       to_char(starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM') as starts_ist,
       capacity,
       price,
       requires_approval,
       is_online
from public.events
where cancelled_at is null
  and starts_at > now()
order by starts_at;
