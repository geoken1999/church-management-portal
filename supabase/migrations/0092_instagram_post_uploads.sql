-- Storage for images uploaded via the dashboard's "Upload post" feature —
-- Instagram's Content Publishing API requires a publicly fetchable URL for
-- the image (no direct file upload to Meta's servers), so this app has to
-- host it somewhere public first, same reasoning as organization-logos
-- (migration 0004). Objects are keyed as "{organization_id}/{uuid}.ext" —
-- unlike a logo, there are many of these over time, not one overwritten
-- file, so no upsert/single-path pattern here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instagram-post-uploads',
  'instagram-post-uploads',
  true,
  26214400, -- 25MB
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Public can view instagram post uploads" on storage.objects;
create policy "Public can view instagram post uploads"
  on storage.objects
  for select
  using (bucket_id = 'instagram-post-uploads');

drop policy if exists "Admins can upload instagram post images" on storage.objects;
create policy "Admins can upload instagram post images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'instagram-post-uploads'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete instagram post images" on storage.objects;
create policy "Admins can delete instagram post images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'instagram-post-uploads'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
