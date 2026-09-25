-- Families — household/family units within a congregation. Unlike
-- Committee (migration 0047), a family is a real entity you create first
-- (with its own name and notes) and then add members to — not just a
-- free-text label repeated on each member row — so it gets its own table.
--
-- This upgrades an already-applied earlier shape of this migration, which
-- modeled a family purely as a free-text family_members.family_name,
-- mirroring Committee. Unlike a drop-and-recreate, this preserves any
-- families/assignments already created under that shape by turning each
-- distinct family_name into a real families row and re-pointing its
-- members at it — nothing is dropped.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists families_organization_id_idx
  on public.families (organization_id);

drop trigger if exists set_families_updated_at on public.families;
create trigger set_families_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();

alter table public.families enable row level security;

drop policy if exists "Members can view families" on public.families;
create policy "Members can view families"
  on public.families for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can create families" on public.families;
create policy "Admins can create families"
  on public.families for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update families" on public.families;
create policy "Admins can update families"
  on public.families for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete families" on public.families;
create policy "Admins can delete families"
  on public.families for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Point family_members at a real family instead of a free-text label. On
-- a fresh install family_members doesn't exist yet at all, so all of this
-- (including the create table below) just builds it directly with the
-- final shape; on an install that already ran the old free-text version,
-- this adds family_id, backfills it from family_name, then drops
-- family_name.
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  relationship text not null check (length(trim(relationship)) >= 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.family_members add column if not exists family_id uuid references public.families (id) on delete cascade;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'family_members' and column_name = 'family_name'
  ) then
    -- One families row per distinct (organization_id, family_name) still
    -- unmigrated — skips org+name combinations a prior partial run of
    -- this migration already created, so it's safe to re-run.
    insert into public.families (organization_id, name)
    select distinct fm.organization_id, fm.family_name
    from public.family_members fm
    where fm.family_id is null
      and not exists (
        select 1 from public.families f where f.organization_id = fm.organization_id and f.name = fm.family_name
      );

    update public.family_members fm
    set family_id = f.id
    from public.families f
    where fm.family_id is null
      and f.organization_id = fm.organization_id
      and f.name = fm.family_name;

    alter table public.family_members drop column family_name;
  end if;
end $$;

alter table public.family_members alter column family_id set not null;

create index if not exists family_members_family_id_idx
  on public.family_members (family_id);
create index if not exists family_members_organization_id_idx
  on public.family_members (organization_id);

-- A member could already appear more than once for the same family_name
-- under the old free-text shape (nothing enforced uniqueness there) — the
-- backfill above would carry every one of those rows forward onto the
-- same family_id, which this unique index would then reject. Keeping only
-- the earliest assignment per (family_id, member_id) mirrors what the new
-- one-row-per-assignment model expects going forward.
delete from public.family_members fm
using public.family_members newer
where fm.family_id = newer.family_id
  and fm.member_id = newer.member_id
  and fm.created_at > newer.created_at;

create unique index if not exists family_members_family_id_member_id_key
  on public.family_members (family_id, member_id);

drop trigger if exists set_family_members_updated_at on public.family_members;
create trigger set_family_members_updated_at
  before update on public.family_members
  for each row execute function public.set_updated_at();

-- Defense-in-depth: family_members.organization_id must always match its
-- parent family's organization_id, same pattern as
-- check_widget_submission_org (migration 0059).
create or replace function public.check_family_member_org()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.families f where f.id = new.family_id and f.organization_id = new.organization_id
  ) then
    raise exception 'organization_id must match the parent family''s organization';
  end if;
  return new;
end;
$$;

drop trigger if exists check_family_member_org on public.family_members;
create trigger check_family_member_org
  before insert or update of family_id, organization_id on public.family_members
  for each row execute function public.check_family_member_org();

alter table public.family_members enable row level security;

drop policy if exists "Members can view family members" on public.family_members;
create policy "Members can view family members"
  on public.family_members for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add family members" on public.family_members;
create policy "Admins can add family members"
  on public.family_members for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update family members" on public.family_members;
create policy "Admins can update family members"
  on public.family_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove family members" on public.family_members;
create policy "Admins can remove family members"
  on public.family_members for delete to authenticated
  using (public.is_org_admin(organization_id));
