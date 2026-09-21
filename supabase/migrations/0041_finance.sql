-- Finance module: Fund Raiser campaigns, Offerings (collected during
-- services, not tied to an individual giver), and Donations (tied to a
-- member or a free-text donor name for non-members/guests). Same
-- permission shape as ministries/leaders/youth — any member can view,
-- only admins can manage by default; the tab permissions matrix (see
-- migration 0040) can grant specific members more.

create table if not exists public.fundraisers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  description text,
  goal_amount numeric(12, 2) not null check (goal_amount > 0),
  branch_id uuid references public.branches (id) on delete set null,
  managed_by uuid references public.members (id) on delete set null,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offerings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category text not null check (length(trim(category)) >= 2),
  amount numeric(12, 2) not null check (amount > 0),
  collected_on date not null,
  branch_id uuid references public.branches (id) on delete set null,
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  -- Free-text fallback for a donor who isn't a member on the roster (a
  -- guest, a visiting family, an outside donor to a fundraiser).
  donor_name text,
  amount numeric(12, 2) not null check (amount > 0),
  donated_on date not null,
  method text not null default 'cash' check (method in ('cash', 'check', 'bank_transfer', 'online', 'other')),
  fundraiser_id uuid references public.fundraisers (id) on delete set null,
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donations_donor_identified check (member_id is not null or donor_name is not null)
);

create index if not exists fundraisers_organization_id_idx on public.fundraisers (organization_id);
create index if not exists offerings_organization_id_idx on public.offerings (organization_id);
create index if not exists donations_organization_id_idx on public.donations (organization_id);
create index if not exists donations_fundraiser_id_idx on public.donations (fundraiser_id);

drop trigger if exists set_fundraisers_updated_at on public.fundraisers;
create trigger set_fundraisers_updated_at
  before update on public.fundraisers
  for each row execute function public.set_updated_at();

drop trigger if exists set_offerings_updated_at on public.offerings;
create trigger set_offerings_updated_at
  before update on public.offerings
  for each row execute function public.set_updated_at();

drop trigger if exists set_donations_updated_at on public.donations;
create trigger set_donations_updated_at
  before update on public.donations
  for each row execute function public.set_updated_at();

alter table public.fundraisers enable row level security;
alter table public.offerings enable row level security;
alter table public.donations enable row level security;

-- fundraisers
drop policy if exists "Members can view fundraisers" on public.fundraisers;
create policy "Members can view fundraisers"
  on public.fundraisers for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create fundraisers" on public.fundraisers;
create policy "Admins can create fundraisers"
  on public.fundraisers for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update fundraisers" on public.fundraisers;
create policy "Admins can update fundraisers"
  on public.fundraisers for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete fundraisers" on public.fundraisers;
create policy "Admins can delete fundraisers"
  on public.fundraisers for delete to authenticated
  using (public.is_org_admin(organization_id));

-- offerings
drop policy if exists "Members can view offerings" on public.offerings;
create policy "Members can view offerings"
  on public.offerings for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can record offerings" on public.offerings;
create policy "Admins can record offerings"
  on public.offerings for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update offerings" on public.offerings;
create policy "Admins can update offerings"
  on public.offerings for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete offerings" on public.offerings;
create policy "Admins can delete offerings"
  on public.offerings for delete to authenticated
  using (public.is_org_admin(organization_id));

-- donations
drop policy if exists "Members can view donations" on public.donations;
create policy "Members can view donations"
  on public.donations for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can record donations" on public.donations;
create policy "Admins can record donations"
  on public.donations for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update donations" on public.donations;
create policy "Admins can update donations"
  on public.donations for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete donations" on public.donations;
create policy "Admins can delete donations"
  on public.donations for delete to authenticated
  using (public.is_org_admin(organization_id));
