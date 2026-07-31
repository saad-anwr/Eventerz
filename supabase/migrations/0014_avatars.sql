-- ---------------------------------------------------------------------------
-- Profile pictures
--
-- `profiles.avatar_url` has existed since 0001, and both clients already render
-- it - but nothing could ever set it from the app, because there was no bucket
-- to upload to. The mobile edit screen said "Your avatar is generated from your
-- wallet" and offered no alternative.
--
-- Mirrors 0004 (event banners) exactly: same path convention, same four
-- policies, same reasoning. Run after 0001. Safe to re-run.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,                                    -- 2 MB; an avatar is never larger
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * Path convention: avatars/<auth.uid()>/<filename>
 *
 * `storage.foldername(name)[1]` is the owner's uid, so comparing it to
 * auth.uid() is what stops one user writing into another's folder. The bucket
 * is public to read - an avatar is shown to anyone who can see the profile, and
 * signing every URL would break caching for no privacy gain.
 */

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users replace their own avatar" on storage.objects;
create policy "users replace their own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users delete their own avatar" on storage.objects;
create policy "users delete their own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
