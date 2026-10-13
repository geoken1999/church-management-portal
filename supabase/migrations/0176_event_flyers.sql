-- An optional flyer image for each event. It is shown on the event, and the advanced church
-- report uses it (a copy is saved into the report so the report keeps its picture).
alter table public.events add column if not exists flyer_path text null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-flyers', 'event-flyers', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Flyers count towards the church's storage, like its other images.
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
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents', 'shared-documents', 'report-images', 'event-flyers')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;

-- Reversal (run manually if needed):
--   alter table public.events drop column if exists flyer_path;
--   (and remove 'event-flyers' from the storage function above)
