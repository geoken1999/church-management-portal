-- Storage for images inserted into the rich-text email body. Public bucket
-- (same reasoning as organization-logos) so the uploaded URL is directly
-- fetchable by every recipient's email client — no signed-URL expiry to
-- worry about breaking an email days after it was sent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-images',
  'email-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Public can view email images" on storage.objects;
create policy "Public can view email images"
  on storage.objects
  for select
  using (bucket_id = 'email-images');

drop policy if exists "Admins can upload email images" on storage.objects;
create policy "Admins can upload email images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'email-images'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete email images" on storage.objects;
create policy "Admins can delete email images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'email-images'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
