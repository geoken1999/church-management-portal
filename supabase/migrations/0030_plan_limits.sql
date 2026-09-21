-- Plan/quota tracking for the shared email service and file storage.
-- Every org is on the "basic" plan for now (limits are enforced in app
-- code, not here) — this column exists so a future plan-selection/billing
-- flow doesn't need another migration to retrofit it. No check constraint
-- yet since the set of valid plans isn't finalized.
alter table public.organizations add column if not exists plan text not null default 'basic';

-- Which path an email campaign went out through — the shared Resend quota
-- only applies to 'shared' sends; an org's own SMTP is unmetered. Backfill
-- assumes 'shared' for any pre-existing rows (the only path that existed
-- before SMTP settings shipped).
alter table public.email_campaigns add column if not exists provider text not null default 'shared' check (provider in ('shared', 'smtp'));

-- Aggregates file storage usage across every org-scoped bucket
-- (organization-logos, worship-documents, email-images all key their
-- object paths as "{organization_id}/..."). A plpgsql function rather than
-- a supabase-js query because `storage.objects` isn't exposed through the
-- public REST schema — only a function defined here in `public` can read
-- across schemas like this.
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
    where bucket_id in ('organization-logos', 'worship-documents', 'email-images')
      and (storage.foldername(name))[1] = target_org_id::text
  );
end;
$$;

revoke all on function public.get_organization_storage_bytes(uuid) from public;
grant execute on function public.get_organization_storage_bytes(uuid) to authenticated;
