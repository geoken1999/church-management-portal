-- Ministries — basic profile info for each ministry a church runs
-- (youth, outreach, worship, etc.). Same permission shape as
-- media_equipment/worship_team_members: any member can view, only
-- admins can manage. managed_by references members (congregants), not
-- organization_members, matching events.managed_by/media_equipment.managed_by.
create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  type text,
  managed_by uuid references public.members (id) on delete set null,
  vision text,
  mission text,
  started_on date,
  future_plans text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ministries_organization_id_idx
  on public.ministries (organization_id);

drop trigger if exists set_ministries_updated_at on public.ministries;
create trigger set_ministries_updated_at
  before update on public.ministries
  for each row execute function public.set_updated_at();

alter table public.ministries enable row level security;

drop policy if exists "Members can view ministries" on public.ministries;
create policy "Members can view ministries"
  on public.ministries for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create ministries" on public.ministries;
create policy "Admins can create ministries"
  on public.ministries for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update ministries" on public.ministries;
create policy "Admins can update ministries"
  on public.ministries for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete ministries" on public.ministries;
create policy "Admins can delete ministries"
  on public.ministries for delete to authenticated
  using (public.is_org_admin(organization_id));
