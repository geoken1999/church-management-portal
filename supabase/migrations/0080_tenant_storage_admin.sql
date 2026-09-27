-- A service-role-only variant of get_organization_storage_bytes (migration
-- 0051) for the new Super Admin per-tenant detail page — that function's
-- own is_org_member() check means a platform admin (who isn't a member of
-- every tenant they oversee) can't call it for someone else's
-- organization. Same query, same bucket list, just no membership check;
-- locked down the same way get_platform_storage_stats (migration 0065)
-- is — revoke the default PUBLIC grant, execute only via the service-role
-- client (src/lib/platform-admin/dal.ts).
create or replace function public.get_tenant_storage_bytes(target_org_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(sum((metadata->>'size')::bigint), 0)
    from storage.objects
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images', 'media-documents', 'shared-documents')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;

revoke all on function public.get_tenant_storage_bytes(uuid) from public;
grant execute on function public.get_tenant_storage_bytes(uuid) to service_role;
