-- ---------------------------------------------------------------------------
-- Eventerz - 0023: clear banners that were never uploaded
--
-- Run after 0022. Safe to re-run.
--
-- What was wrong
-- --------------
-- The mobile create wizard set `cover_image` to whatever URI
-- `expo-image-picker` returned and wrote it straight to the row. That URI is a
-- device-local path:
--
--     file:///data/user/0/xyz.eventerz.app/cache/ImagePicker/abc.jpeg
--
-- Nothing was ever uploaded. The value is unusable on every surface, including
-- the phone that wrote it once the OS clears its picker cache, and on the
-- website `file://` addresses the *visitor's* disk rather than the host's - so
-- there was no device on which it could have resolved to the intended image.
--
-- The write path is fixed: `uploadEventBanner` puts the bytes in the
-- `event-banners` bucket (0004) and stores the public URL. Both clients also
-- now filter non-http values at the mapping layer, so a bad row renders the
-- event's gradient instead of a broken-image icon.
--
-- This clears the rows that were already written. Belt and braces on purpose:
-- the client guard is what protects against a value written *after* this runs,
-- and this is what stops the database carrying data that means nothing.
--
-- Why null and not a placeholder: the gradient is the designed empty state for
-- an event with no banner, and these events genuinely have none - the image the
-- host picked was never uploaded anywhere and cannot be recovered. A host who
-- wants a banner can add one by editing the event, which now uploads properly.
-- ---------------------------------------------------------------------------

update public.events
set cover_image = null
where cover_image is not null
  -- Anything that is not an absolute http(s) URL. Written as "not matching"
  -- rather than "matching file://" so a `content://`, a bare path, or any other
  -- scheme a future picker invents is caught by the same statement.
  and cover_image !~* '^(https?:)?//';

comment on column public.events.cover_image is
  'Public URL of the uploaded banner, or null for the gradient. Must be http(s) - see 0023.';
