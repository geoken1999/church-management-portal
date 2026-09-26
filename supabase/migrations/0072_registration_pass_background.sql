-- Lets an organizer add a hero/background image to the emailed registration
-- pass (migration 0071 added the color + message half of pass design). A
-- public Storage bucket, same reasoning as organization-logos (migration
-- 0004): the pass email embeds this image by its public URL directly, so it
-- needs to be fetchable by every recipient's mail client without a signed
-- URL expiring. Objects are keyed as "{organization_id}/{event_id}" (no
-- extension, same as organization-logos) so re-uploading overwrites via
-- upsert instead of accumulating orphaned files.
alter table public.events
  add column if not exists registration_pass_background_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-pass-backgrounds',
  'event-pass-backgrounds',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Public can view event pass backgrounds" on storage.objects;
create policy "Public can view event pass backgrounds"
  on storage.objects
  for select
  using (bucket_id = 'event-pass-backgrounds');

drop policy if exists "Admins can upload event pass backgrounds" on storage.objects;
create policy "Admins can upload event pass backgrounds"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-pass-backgrounds'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can update event pass backgrounds" on storage.objects;
create policy "Admins can update event pass backgrounds"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'event-pass-backgrounds'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'event-pass-backgrounds'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete event pass backgrounds" on storage.objects;
create policy "Admins can delete event pass backgrounds"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event-pass-backgrounds'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
