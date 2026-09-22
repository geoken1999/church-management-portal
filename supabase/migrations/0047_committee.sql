-- Committee — members serving on a church committee (Finance, Building,
-- Outreach, etc.). committee_name is free text rather than a separate
-- Committees table, since churches name and organize these differently —
-- same shape as worship_team_members/media_team_members: any member can
-- view, only admins can manage by default (the tab permissions matrix,
-- migration 0040, can grant specific members more).
create table if not exists public.committee_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  committee_name text not null check (length(trim(committee_name)) >= 2),
  role text not null check (length(trim(role)) >= 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists committee_members_organization_id_idx
  on public.committee_members (organization_id);

drop trigger if exists set_committee_members_updated_at on public.committee_members;
create trigger set_committee_members_updated_at
  before update on public.committee_members
  for each row execute function public.set_updated_at();

alter table public.committee_members enable row level security;

drop policy if exists "Members can view committee members" on public.committee_members;
create policy "Members can view committee members"
  on public.committee_members for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add committee members" on public.committee_members;
create policy "Admins can add committee members"
  on public.committee_members for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update committee members" on public.committee_members;
create policy "Admins can update committee members"
  on public.committee_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove committee members" on public.committee_members;
create policy "Admins can remove committee members"
  on public.committee_members for delete to authenticated
  using (public.is_org_admin(organization_id));
