-- Youth — a roster of members who are part of the youth ministry, same
-- shape/permissions as leaders (member_id + a few youth-specific fields
-- instead of a title). A member can be both a leader and a youth
-- (e.g. a youth group student leader), so this is its own table rather
-- than reusing leaders.title for it.
create table if not exists public.youths (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  grade text,
  guardian_name text,
  guardian_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_id)
);

create index if not exists youths_organization_id_idx
  on public.youths (organization_id);

drop trigger if exists set_youths_updated_at on public.youths;
create trigger set_youths_updated_at
  before update on public.youths
  for each row execute function public.set_updated_at();

alter table public.youths enable row level security;

drop policy if exists "Members can view youth" on public.youths;
create policy "Members can view youth"
  on public.youths for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add youth" on public.youths;
create policy "Admins can add youth"
  on public.youths for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update youth" on public.youths;
create policy "Admins can update youth"
  on public.youths for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove youth" on public.youths;
create policy "Admins can remove youth"
  on public.youths for delete to authenticated
  using (public.is_org_admin(organization_id));
