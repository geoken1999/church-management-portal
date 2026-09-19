-- Module 01 (extended): richer organization-creation onboarding.
-- Captures church size, number of campuses, and the creating user's role at
-- their church. No subscription/seat-limit enforcement is added here — that
-- belongs to a future billing module; these columns are informational only.
-- Run after 0002_organizations.sql.

alter table public.organizations
  add column if not exists member_count_range text
    check (member_count_range in ('1-50', '51-200', '201-500', '501-1000', '1000+')),
  add column if not exists branch_range text
    check (branch_range in ('1', '2-3', '4-10', '10+'));

-- The member's descriptive role/title at their church (e.g. "Senior Pastor").
-- Distinct from `role`, which is the owner/admin/member permission level.
alter table public.organization_members
  add column if not exists title text;

-- Replaces the 2-arg version from 0002_organizations.sql. Drop it first so
-- Postgres doesn't end up with two overloads of the same name — PostgREST's
-- RPC dispatch (matching by named JSON args) can't disambiguate those.
drop function if exists public.create_organization(text, text);

create or replace function public.create_organization(
  org_name text,
  org_slug text,
  member_count_range text default null,
  branch_range text default null,
  member_title text default null
)
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

  insert into public.organizations (name, slug, created_by, member_count_range, branch_range)
  values (trim(org_name), org_slug, auth.uid(), member_count_range, branch_range)
  returning * into new_org;

  insert into public.organization_members (organization_id, auth_user_id, role, title)
  values (new_org.id, auth.uid(), 'owner', nullif(trim(member_title), ''));

  update public.profiles
  set active_organization_id = new_org.id
  where auth_user_id = auth.uid();

  return new_org;
end;
$$;

grant execute on function public.create_organization(text, text, text, text, text) to authenticated;
