-- Module 01 (extended): church logo upload.
-- Adds organizations.logo_url and a public Storage bucket for logo files.
-- Objects are keyed as "{organization_id}/logo" (no extension — the browser
-- relies on the stored Content-Type, not the URL, to render the image), so
-- re-uploading overwrites the previous logo via upsert rather than
-- accumulating orphaned files.

alter table public.organizations
  add column if not exists logo_url text;

-- file_size_limit is in bytes (10MB here). Written as an upsert so bumping
-- this later just means editing the value and re-running the migration.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Logos aren't sensitive, and the bucket is public — mirror that with an
-- explicit read policy so direct Storage API reads (not just the CDN URL)
-- work the same way.
drop policy if exists "Public can view organization logos" on storage.objects;
create policy "Public can view organization logos"
  on storage.objects
  for select
  using (bucket_id = 'organization-logos');

drop policy if exists "Admins can upload their organization logo" on storage.objects;
create policy "Admins can upload their organization logo"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'organization-logos'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can update their organization logo" on storage.objects;
create policy "Admins can update their organization logo"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'organization-logos'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete their organization logo" on storage.objects;
create policy "Admins can delete their organization logo"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );
