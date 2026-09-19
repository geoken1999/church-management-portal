-- Module 01 (extended): Multi-tenancy foundation.
-- Introduces organizations as the tenant boundary, memberships linking users
-- to organizations with a role, and email invitations. Every user creates or
-- joins an organization during onboarding (after signup, before dashboard).
-- Run after 0001_create_profiles.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) >= 2),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, auth_user_id)
);

create index if not exists organization_members_auth_user_id_idx
  on public.organization_members (auth_user_id);
create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id);

-- A second FK (alongside the one to auth.users above) purely so PostgREST
-- can embed `profiles` through `organization_members` in a single query
-- (e.g. `.select("role, profiles(first_name, last_name)")`).
alter table public.organization_members
  drop constraint if exists organization_members_profile_fk,
  add constraint organization_members_profile_fk
    foreign key (auth_user_id) references public.profiles (auth_user_id) on delete cascade;

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index if not exists organization_invitations_email_idx
  on public.organization_invitations (email);
create index if not exists organization_invitations_organization_id_idx
  on public.organization_invitations (organization_id);

-- Which organization a user is currently "in" — set on org creation/invite
-- acceptance, changeable via the org switcher. Guarded by a trigger below so
-- it can only ever point at an organization the user actually belongs to.
alter table public.profiles
  add column if not exists active_organization_id uuid references public.organizations (id) on delete set null;

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
  before update on public.organizations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: run as table owner, bypassing RLS, so
-- they can be safely called from inside RLS policies without recursion).
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id
      and auth_user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.shares_organization_with(target_auth_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m1
    join public.organization_members m2 on m1.organization_id = m2.organization_id
    where m1.auth_user_id = auth.uid()
      and m2.auth_user_id = target_auth_user_id
  );
$$;

create or replace function public.check_active_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_organization_id is not null then
    if not exists (
      select 1 from public.organization_members
      where organization_id = new.active_organization_id
        and auth_user_id = new.auth_user_id
    ) then
      raise exception 'You are not a member of this organization.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_profiles_active_organization on public.profiles;
create trigger check_profiles_active_organization
  before insert or update of active_organization_id on public.profiles
  for each row
  execute function public.check_active_organization();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;

drop policy if exists "Members can view their organizations" on public.organizations;
create policy "Members can view their organizations"
  on public.organizations
  for select
  to authenticated
  using (public.is_org_member(id));

drop policy if exists "Invitees can preview organizations they're invited to" on public.organizations;
create policy "Invitees can preview organizations they're invited to"
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.organization_invitations i
      where i.organization_id = organizations.id
        and i.status = 'pending'
        and i.expires_at > now()
        and i.email = (auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Admins can update their organization" on public.organizations;
create policy "Admins can update their organization"
  on public.organizations
  for update
  to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- No direct insert policy: organizations are created exclusively through the
-- create_organization() RPC below, which also creates the owner membership.

drop policy if exists "Members can view fellow org members" on public.organization_members;
create policy "Members can view fellow org members"
  on public.organization_members
  for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Members can leave an organization" on public.organization_members;
create policy "Members can leave an organization"
  on public.organization_members
  for delete
  to authenticated
  using (auth_user_id = auth.uid() or public.is_org_admin(organization_id));

drop policy if exists "Admins can change member roles" on public.organization_members;
create policy "Admins can change member roles"
  on public.organization_members
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- No direct insert policy: memberships are created exclusively through the
-- create_organization() / accept_invitation() RPCs below.

drop policy if exists "Admins can view org invitations" on public.organization_invitations;
create policy "Admins can view org invitations"
  on public.organization_invitations
  for select
  to authenticated
  using (
    public.is_org_admin(organization_id)
    or email = (auth.jwt() ->> 'email')
  );

drop policy if exists "Admins can create invitations" on public.organization_invitations;
create policy "Admins can create invitations"
  on public.organization_invitations
  for insert
  to authenticated
  with check (public.is_org_admin(organization_id) and invited_by = auth.uid());

drop policy if exists "Admins can revoke invitations" on public.organization_invitations;
create policy "Admins can revoke invitations"
  on public.organization_invitations
  for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete invitations" on public.organization_invitations;
create policy "Admins can delete invitations"
  on public.organization_invitations
  for delete
  to authenticated
  using (public.is_org_admin(organization_id));

-- Teammates can see each other's basic profile (needed for the members list).
drop policy if exists "Org members can view teammate profiles" on public.profiles;
create policy "Org members can view teammate profiles"
  on public.profiles
  for select
  to authenticated
  using (public.shares_organization_with(auth_user_id));

-- ---------------------------------------------------------------------------
-- RPCs — the only way rows are written to organizations/organization_members,
-- so multi-row invariants (an org always has an owner, etc.) can't be broken
-- by a partial client-side write.
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(org_name text, org_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
begin
  if org_name is null or length(trim(org_name)) < 2 then
    raise exception 'Organization name must be at least 2 characters.';
  end if;

  if org_slug is null or org_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid organization slug.';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(org_name), org_slug, auth.uid())
  returning * into new_org;

  insert into public.organization_members (organization_id, auth_user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  update public.profiles
  set active_organization_id = new_org.id
  where auth_user_id = auth.uid();

  return new_org;
end;
$$;

create or replace function public.accept_invitation(invite_token uuid)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.organization_invitations;
  org public.organizations;
  current_email text;
begin
  current_email := auth.jwt() ->> 'email';

  select * into inv
  from public.organization_invitations
  where token = invite_token
    and status = 'pending'
    and expires_at > now();

  if inv is null then
    raise exception 'This invitation is invalid or has expired.';
  end if;

  if current_email is null or lower(inv.email) <> lower(current_email) then
    raise exception 'This invitation was sent to a different email address.';
  end if;

  insert into public.organization_members (organization_id, auth_user_id, role)
  values (inv.organization_id, auth.uid(), inv.role)
  on conflict (organization_id, auth_user_id) do nothing;

  update public.organization_invitations
  set status = 'accepted'
  where id = inv.id;

  update public.profiles
  set active_organization_id = coalesce(active_organization_id, inv.organization_id)
  where auth_user_id = auth.uid();

  select * into org from public.organizations where id = inv.organization_id;
  return org;
end;
$$;

-- Lets someone preview an invitation from its link before they've signed in.
-- The token is an unguessable capability (like a password-reset token), so
-- exposing this little without auth is the standard invite-link pattern.
create or replace function public.get_invitation_preview(invite_token uuid)
returns table (organization_name text, email text, status text, expires_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select o.name, i.email, i.status, i.expires_at
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token = invite_token;
$$;

grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;
