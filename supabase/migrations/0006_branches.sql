-- Branches module: the actual list of campuses/locations a church runs,
-- each with its own leader and member count. Distinct from
-- organizations.branch_count (a self-reported number collected at
-- onboarding) — that stays as a quick stat; this table is the real,
-- manageable list shown on the Branches page.

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  location text,
  member_count integer check (member_count >= 0),
  leader_name text,
  leader_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists branches_organization_id_idx on public.branches (organization_id);

drop trigger if exists set_branches_updated_at on public.branches;
create trigger set_branches_updated_at
  before update on public.branches
  for each row
  execute function public.set_updated_at();

alter table public.branches enable row level security;

drop policy if exists "Members can view their organization's branches" on public.branches;
create policy "Members can view their organization's branches"
  on public.branches
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add branches" on public.branches;
create policy "Admins can add branches"
  on public.branches
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update branches" on public.branches;
create policy "Admins can update branches"
  on public.branches
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete branches" on public.branches;
create policy "Admins can delete branches"
  on public.branches
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));
