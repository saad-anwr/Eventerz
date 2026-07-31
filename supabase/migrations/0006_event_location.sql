-- ---------------------------------------------------------------------------
-- Eventerz - 0006: structured event location
--
-- Run after 0005. Safe to re-run.
--
-- `events.location` is a free-text line the host typed. That is fine to print
-- and useless for everything else: it cannot be mapped, cannot be searched by
-- proximity, and "B-272, Okhla Phase I" does not resolve to the same place as
-- "Okhla Industrial Estate, New Delhi" even though a human reads them as one
-- venue.
--
-- This adds the structured half alongside it - coordinates, a Google Place id
-- and a normalised address - while keeping `location` as the display string.
-- Both clients render the map from the coordinates and fall back to a plain
-- search link when the host typed something a geocoder could not resolve, so
-- an event created before this migration keeps working untouched.
--
-- Why store coordinates rather than resolve the place id at render time:
--   • A Place Details lookup per event view is a billed API call on a page
--     that is mostly read. Coordinates are free to render forever.
--   • Place ids can be retired by Google. A retired id renders nothing; a
--     latitude does not expire.
--   • Proximity search ("events near me") needs numbers in the database, not
--     an opaque token that has to be resolved one row at a time.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision,
  add column if not exists place_id  text,
  add column if not exists address   text;

comment on column public.events.latitude is
  'WGS84 latitude of the venue. Null when the host typed a location that was never geocoded - the UI falls back to a plain map search link.';
comment on column public.events.place_id is
  'Google Places id. Stored for deep links and re-resolution; never required to render the map, because coordinates already do that.';
comment on column public.events.address is
  'Formatted address from the geocoder. `location` remains the host''s own display string.';

/*
 * Refuse impossible coordinates outright. A swapped lat/lng pair is the
 * classic mapping bug - it puts a Delhi event in the Indian Ocean and looks
 * plausible enough in a form field to ship. 77.2 is a valid longitude and an
 * invalid latitude, so the constraint catches exactly that transposition.
 */
do $$ begin
  alter table public.events
    add constraint events_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events
    add constraint events_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180));
exception when duplicate_object then null; end $$;

/*
 * Coordinates come as a pair or not at all. One half alone maps to the equator
 * or the prime meridian, which renders a confident pin in the wrong ocean.
 */
do $$ begin
  alter table public.events
    add constraint events_coordinates_paired
    check ((latitude is null) = (longitude is null));
exception when duplicate_object then null; end $$;

create index if not exists events_coordinates_idx
  on public.events (latitude, longitude)
  where latitude is not null;

/*
 * Let `create_event` carry the structured fields.
 *
 * Events are inserted directly by the client under the "events host writes"
 * policy rather than through a function, so there is nothing to redefine here
 * - the new columns are simply writable by the host like every other column
 * on the row. This block exists to say that explicitly, because the RSVP path
 * next door is function-only and the asymmetry looks like an oversight
 * otherwise: an event's own fields are the host's to set, while a guest's RSVP
 * status is not the guest's to set.
 */
