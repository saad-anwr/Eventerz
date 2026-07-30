-- ---------------------------------------------------------------------------
-- Eventerz — 0004: event banner storage
--
-- A public bucket for event cover images. Public because banners appear on
-- event cards to signed-out visitors; if these were private every card would
-- need a signed URL, which cannot be cached by a CDN.
--
-- Writes are still restricted: a user may only touch files under their own
-- `<uid>/` prefix, so nobody can overwrite or delete another host's banner.
--
-- Run after 0003. Safe to re-run.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-banners',
  'event-banners',
  true,
  5242880,                                    -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * Path convention: event-banners/<auth.uid()>/<filename>
 *
 * `storage.foldername(name)` splits the object path, so [1] is the owner's uid.
 * Comparing it to auth.uid() is what scopes writes per user.
 */

drop policy if exists "event banners are publicly readable" on storage.objects;
create policy "event banners are publicly readable" on storage.objects
  for select using (bucket_id = 'event-banners');

drop policy if exists "users upload their own event banners" on storage.objects;
create policy "users upload their own event banners" on storage.objects
  for insert with check (
    bucket_id = 'event-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users replace their own event banners" on storage.objects;
create policy "users replace their own event banners" on storage.objects
  for update using (
    bucket_id = 'event-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users delete their own event banners" on storage.objects;
create policy "users delete their own event banners" on storage.objects
  for delete using (
    bucket_id = 'event-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
