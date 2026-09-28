-- The "Planner" tool (Tools group) — distinct from To Do (migration 0032),
-- which is a flat list of individually-assigned tasks. A Plan is a named
-- initiative (e.g. "Sunday Service", "Building Renovation") with a
-- freeform notes area for jotting things down, an optional target date,
-- and a checklist of steps. Checklist items are stored as a jsonb array on
-- the plan itself (mirroring how forms.fields and
-- events.registration_fields already store their own item lists) rather
-- than a separate child table — an item is just {id, text, done}, with no
-- need for its own RLS, ordering column, or cross-referencing, so a second
-- table would be pure overhead here.
--
-- Table name is "plans", unrelated to the billing "plans" config in
-- src/lib/plans/config.ts (a hardcoded TS list, not a DB table) — app code
-- for this feature lives under src/lib/planner/ to avoid colliding with
-- that existing src/lib/plans/ directory on disk.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  notes text,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  target_date date,
  items jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_organization_id_idx on public.plans (organization_id);
create index if not exists plans_organization_id_status_idx on public.plans (organization_id, status);

drop trigger if exists set_plans_updated_at on public.plans;
create trigger set_plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

alter table public.plans enable row level security;

-- Same "any org member can fully manage" shape as todos (migration 0032) —
-- a plan is shared team content, not personal, per product decision.
drop policy if exists "Members can view their org's plans" on public.plans;
create policy "Members can view their org's plans"
  on public.plans for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can create plans" on public.plans;
create policy "Members can create plans"
  on public.plans for insert to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can update plans" on public.plans;
create policy "Members can update plans"
  on public.plans for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "Members can delete plans" on public.plans;
create policy "Members can delete plans"
  on public.plans for delete to authenticated
  using (public.is_org_member(organization_id));
