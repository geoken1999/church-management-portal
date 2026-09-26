-- Platform-wide storage/database size for the Super Admin Health page.
-- storage.objects and pg_database_size() aren't reachable from the JS
-- client directly (storage isn't a PostgREST-exposed schema, and
-- pg_database_size is a system function) — same reason
-- get_organization_storage_bytes (migration 0030) exists as an RPC rather
-- than a direct table query. Unlike that one, this has no per-org
-- membership check (it's a platform-wide total, not one org's figure), so
-- it's locked down by revoking the default PUBLIC execute grant instead —
-- only the service-role client (src/lib/platform-admin/dal.ts) can call it.
create or replace function public.get_platform_storage_stats()
returns table (
  file_storage_bytes bigint,
  database_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects) as file_storage_bytes,
    pg_database_size(current_database()) as database_bytes;
end;
$$;

revoke all on function public.get_platform_storage_stats() from public;
grant execute on function public.get_platform_storage_stats() to service_role;
