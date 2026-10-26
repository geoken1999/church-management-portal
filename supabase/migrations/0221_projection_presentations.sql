-- PowerPoint (and picture) slides for verse projection. A church loads a presentation of songs; each slide is turned into
-- a picture in the browser and stored here, and the projector shows that picture across the whole screen.
--
-- Public bucket, objects keyed "{organization_id}/{uuid}.jpg" with an unguessable name, same reasoning as the other
-- image buckets: the projector page, OBS and members' phones load them by plain address. Uploads use signed upload
-- links made by the server after the Live stream permission and the storage quota are checked.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projection-slides', 'projection-slides', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "Public can view projection slides" on storage.objects;
create policy "Public can view projection slides"
  on storage.objects
  for select
  using (bucket_id = 'projection-slides');

-- A presentation is one more kind of item in the church's library. Its slides are the pictures, in order, each with
-- the text found on the slide (for the alt text and for the app).
alter table public.projection_items drop constraint if exists projection_items_kind_check;
alter table public.projection_items
  add constraint projection_items_kind_check check (kind in ('song', 'announcement', 'custom', 'presentation'));
alter table public.projection_items add column if not exists slide_images jsonb;

-- The pictures count toward the church's storage package like its other uploads. Same function and buckets as 0176,
-- plus 'projection-slides'.
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
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents', 'shared-documents', 'report-images', 'event-flyers', 'projection-slides')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;

-- Reversal (run manually if needed):
--   alter table public.projection_items drop column if exists slide_images;
--   alter table public.projection_items drop constraint if exists projection_items_kind_check;
--   alter table public.projection_items add constraint projection_items_kind_check check (kind in ('song', 'announcement', 'custom'));
--   (and re-run get_organization_storage_bytes from migration 0176; delete the projection-slides bucket in the dashboard)
