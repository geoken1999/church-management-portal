-- Replaces the bucketed branch_range ('1', '2-3', '4-10', '10+') with an
-- exact integer count — simpler to collect and to display than a range.

alter table public.organizations
  add column if not exists branch_count integer check (branch_count >= 1);

alter table public.organizations
  drop column if exists branch_range;

-- Replaces the previous 5-arg version (org_name, org_slug,
-- member_count_range, branch_range, member_title) from 0003.
drop function if exists public.create_organization(text, text, text, text, text);

create or replace function public.create_organization(
  org_name text,
  org_slug text,
  member_count_range text default null,
  branch_count integer default null,
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

  insert into public.organizations (name, slug, created_by, member_count_range, branch_count)
  values (trim(org_name), org_slug, auth.uid(), member_count_range, branch_count)
  returning * into new_org;

  insert into public.organization_members (organization_id, auth_user_id, role, title)
  values (new_org.id, auth.uid(), 'owner', nullif(trim(member_title), ''));

  update public.profiles
  set active_organization_id = new_org.id
  where auth_user_id = auth.uid();

  return new_org;
end;
$$;

grant execute on function public.create_organization(text, text, text, integer, text) to authenticated;
