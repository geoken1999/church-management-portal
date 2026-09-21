-- Leaders — a curated subset of members designated as eligible to manage
-- things (ministries, branches, events). Same shape as
-- worship_team_members/media_team_members (member_id + an optional title,
-- e.g. "Senior Pastor", "Elder"), but org-wide rather than tied to one
-- module. Deliberately NOT used by Media or Worship's own team pickers —
-- those keep drawing from the full members list.
create table if not exists public.leaders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_id)
);

create index if not exists leaders_organization_id_idx
  on public.leaders (organization_id);

drop trigger if exists set_leaders_updated_at on public.leaders;
create trigger set_leaders_updated_at
  before update on public.leaders
  for each row execute function public.set_updated_at();

alter table public.leaders enable row level security;

drop policy if exists "Members can view leaders" on public.leaders;
create policy "Members can view leaders"
  on public.leaders for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add leaders" on public.leaders;
create policy "Admins can add leaders"
  on public.leaders for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update leaders" on public.leaders;
create policy "Admins can update leaders"
  on public.leaders for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove leaders" on public.leaders;
create policy "Admins can remove leaders"
  on public.leaders for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Branches didn't previously have a proper "manager" reference — just free
-- text leader_name/leader_phone. Those columns stay (existing data isn't
-- touched), but the branch form now sources a real manager from Leaders
-- via this column, same pattern as ministries.managed_by/events.managed_by.
alter table public.branches add column if not exists managed_by uuid references public.members (id) on delete set null;
