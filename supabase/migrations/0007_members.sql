-- Members module: the church's congregation roster (distinct from
-- organization_members, which is app/login accounts). Admins define custom
-- fields per organization; member records store those values in a jsonb
-- column keyed by field `key`, so adding a field never requires a migration.

create table if not exists public.member_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  label text not null check (length(trim(label)) >= 1),
  field_type text not null check (field_type in ('text', 'number', 'date', 'checkbox', 'select')),
  options jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create index if not exists member_field_definitions_organization_id_idx
  on public.member_field_definitions (organization_id);

drop trigger if exists set_member_field_definitions_updated_at on public.member_field_definitions;
create trigger set_member_field_definitions_updated_at
  before update on public.member_field_definitions
  for each row
  execute function public.set_updated_at();

alter table public.member_field_definitions enable row level security;

drop policy if exists "Members can view field definitions" on public.member_field_definitions;
create policy "Members can view field definitions"
  on public.member_field_definitions
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add field definitions" on public.member_field_definitions;
create policy "Admins can add field definitions"
  on public.member_field_definitions
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update field definitions" on public.member_field_definitions;
create policy "Admins can update field definitions"
  on public.member_field_definitions
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete field definitions" on public.member_field_definitions;
create policy "Admins can delete field definitions"
  on public.member_field_definitions
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  first_name text not null check (length(trim(first_name)) >= 1),
  last_name text not null check (length(trim(last_name)) >= 1),
  email text,
  phone text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists members_organization_id_idx on public.members (organization_id);

drop trigger if exists set_members_updated_at on public.members;
create trigger set_members_updated_at
  before update on public.members
  for each row
  execute function public.set_updated_at();

alter table public.members enable row level security;

-- Any team member can view/add/edit congregation records (day-to-day data
-- entry); deleting a record is restricted to admins as a safety net.
drop policy if exists "Org members can view members" on public.members;
create policy "Org members can view members"
  on public.members
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Org members can add members" on public.members;
create policy "Org members can add members"
  on public.members
  for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Org members can update members" on public.members;
create policy "Org members can update members"
  on public.members
  for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Admins can delete members" on public.members;
create policy "Admins can delete members"
  on public.members
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));
