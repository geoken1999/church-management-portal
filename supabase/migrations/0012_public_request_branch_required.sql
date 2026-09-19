-- Branch selection becomes mandatory on the public join form — but only
-- when the church actually has branches to choose from. An organization
-- with zero branches has nothing to force a visitor to pick, so branch_id
-- may still be null in that case.

-- branch_id moves before the defaulted params (email, custom_fields) since
-- it's no longer optional itself — a different position/type at the old
-- slots 5/6, so the previous signature is a distinct overload to drop.
drop function if exists public.submit_member_request(text, text, text, text, text, uuid, jsonb);

create or replace function public.submit_member_request(
  org_slug text,
  first_name text,
  last_name text,
  phone text,
  branch_id uuid,
  email text default null,
  custom_fields jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  new_id uuid;
  clean_phone text;
  org_has_branches boolean;
begin
  select id into org_id from public.organizations where slug = org_slug;
  if org_id is null then
    raise exception 'This organization could not be found.';
  end if;

  if first_name is null or length(trim(first_name)) < 1 then
    raise exception 'First name is required.';
  end if;
  if last_name is null or length(trim(last_name)) < 1 then
    raise exception 'Last name is required.';
  end if;

  clean_phone := nullif(trim(phone), '');
  if clean_phone is null then
    raise exception 'Phone number is required.';
  end if;

  select exists (
    select 1 from public.branches b where b.organization_id = org_id
  ) into org_has_branches;

  if branch_id is null then
    if org_has_branches then
      raise exception 'Please select a branch.';
    end if;
  elsif not exists (
    select 1 from public.branches b where b.id = branch_id and b.organization_id = org_id
  ) then
    raise exception 'Invalid branch selected.';
  end if;

  if exists (
    select 1 from public.members m
    where m.organization_id = org_id
      and m.phone = clean_phone
  ) then
    raise exception 'A request with this phone number has already been submitted.';
  end if;

  if exists (
    select 1 from public.member_field_definitions f
    where f.organization_id = org_id
      and f.required
      and not (coalesce(custom_fields, '{}'::jsonb) ? f.key)
  ) then
    raise exception 'Please fill in all required fields.';
  end if;

  insert into public.members (organization_id, first_name, last_name, email, phone, branch_id, custom_fields, status)
  values (
    org_id,
    trim(first_name),
    trim(last_name),
    nullif(trim(email), ''),
    clean_phone,
    branch_id,
    coalesce(custom_fields, '{}'::jsonb),
    'pending'
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_member_request(text, text, text, text, uuid, text, jsonb) to anon, authenticated;
