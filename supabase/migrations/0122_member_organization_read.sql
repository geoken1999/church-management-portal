-- The mobile app's "My Church" tab needs to read the organizations row
-- itself (name, logo) — "Members can view their organizations" (migration
-- 0002) only covers staff (is_org_member, via organization_members), which
-- a phone-OTP member never has a row in. Same pattern as is_org_member/
-- is_org_admin, just checked against members.auth_user_id instead.
create or replace function public.is_linked_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where organization_id = target_org_id
      and auth_user_id = auth.uid()
      and status = 'active'
  );
$$;

drop policy if exists "Linked members can view their organization" on public.organizations;
create policy "Linked members can view their organization"
  on public.organizations for select to authenticated
  using (public.is_linked_member(id));

-- Reversal (run manually if needed):
--   drop policy if exists "Linked members can view their organization" on public.organizations;
--   drop function if exists public.is_linked_member(uuid);
