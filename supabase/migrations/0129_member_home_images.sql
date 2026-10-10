-- Images uploaded in Design Studio for the members' Home tab (banner
-- slides first). Public bucket, same reasoning as organization-logos and
-- email-images: members' phones load these by plain URL. Objects are keyed
-- "{organization_id}/{uuid}.jpg"; uploads go through a server action that
-- checks the plan's storage quota first, and the bucket is counted in
-- get_organization_storage_bytes below so they consume the church's
-- storage package like every other upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-home-images',
  'member-home-images',
  true,
  2097152, -- 2MB; banners are cropped to a fixed size and re-encoded in the browser
  array['image/jpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Public can view member home images" on storage.objects;
create policy "Public can view member home images"
  on storage.objects
  for select
  using (bucket_id = 'member-home-images');

drop policy if exists "Admins can upload member home images" on storage.objects;
create policy "Admins can upload member home images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'member-home-images'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Admins can delete member home images" on storage.objects;
create policy "Admins can delete member home images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'member-home-images'
    and public.is_org_admin(((storage.foldername(name))[1])::uuid)
  );

-- Same function and buckets as 0051, plus 'member-home-images'.
create or replace function public.get_organization_storage_bytes(target_org_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_org_member(target_org_id) then
    raise exception 'Not authorized';
  end if;

  return (
    select coalesce(sum((metadata->>'size')::bigint), 0)
    from storage.objects
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents', 'shared-documents', 'member-home-images')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;

-- Reversal (run manually if needed): restore get_organization_storage_bytes
-- from 0051, then drop the three policies above and the bucket.
