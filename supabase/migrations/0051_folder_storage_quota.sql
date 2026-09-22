-- get_organization_storage_bytes (redefined in 0033) never included the
-- 'shared-documents' bucket added by 0049 — Folder uploads didn't count
-- against the organization's storage plan at all. Same function, same
-- buckets, plus 'shared-documents'.
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
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents', 'shared-documents')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;
