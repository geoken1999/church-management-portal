-- Media module: the team, equipment, and social accounts a church's media
-- ministry runs. Every "person responsible" field references the
-- congregation roster (public.members) by id rather than a free-text name,
-- so it can't drift from the actual member record.

create table if not exists public.media_team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  role text not null check (length(trim(role)) >= 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  managed_by uuid references public.members (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_social_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  platform text not null check (length(trim(platform)) >= 2),
  handle text,
  managed_by uuid references public.members (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_team_members_organization_id_idx on public.media_team_members (organization_id);
create index if not exists media_equipment_organization_id_idx on public.media_equipment (organization_id);
create index if not exists media_social_accounts_organization_id_idx on public.media_social_accounts (organization_id);

drop trigger if exists set_media_team_members_updated_at on public.media_team_members;
create trigger set_media_team_members_updated_at
  before update on public.media_team_members
  for each row execute function public.set_updated_at();

drop trigger if exists set_media_equipment_updated_at on public.media_equipment;
create trigger set_media_equipment_updated_at
  before update on public.media_equipment
  for each row execute function public.set_updated_at();

drop trigger if exists set_media_social_accounts_updated_at on public.media_social_accounts;
create trigger set_media_social_accounts_updated_at
  before update on public.media_social_accounts
  for each row execute function public.set_updated_at();

alter table public.media_team_members enable row level security;
alter table public.media_equipment enable row level security;
alter table public.media_social_accounts enable row level security;

-- media_team_members
drop policy if exists "Members can view media team" on public.media_team_members;
create policy "Members can view media team"
  on public.media_team_members for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add media team members" on public.media_team_members;
create policy "Admins can add media team members"
  on public.media_team_members for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update media team members" on public.media_team_members;
create policy "Admins can update media team members"
  on public.media_team_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete media team members" on public.media_team_members;
create policy "Admins can delete media team members"
  on public.media_team_members for delete to authenticated
  using (public.is_org_admin(organization_id));

-- media_equipment
drop policy if exists "Members can view media equipment" on public.media_equipment;
create policy "Members can view media equipment"
  on public.media_equipment for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add media equipment" on public.media_equipment;
create policy "Admins can add media equipment"
  on public.media_equipment for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update media equipment" on public.media_equipment;
create policy "Admins can update media equipment"
  on public.media_equipment for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete media equipment" on public.media_equipment;
create policy "Admins can delete media equipment"
  on public.media_equipment for delete to authenticated
  using (public.is_org_admin(organization_id));

-- media_social_accounts
drop policy if exists "Members can view media social accounts" on public.media_social_accounts;
create policy "Members can view media social accounts"
  on public.media_social_accounts for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add media social accounts" on public.media_social_accounts;
create policy "Admins can add media social accounts"
  on public.media_social_accounts for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update media social accounts" on public.media_social_accounts;
create policy "Admins can update media social accounts"
  on public.media_social_accounts for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete media social accounts" on public.media_social_accounts;
create policy "Admins can delete media social accounts"
  on public.media_social_accounts for delete to authenticated
  using (public.is_org_admin(organization_id));
