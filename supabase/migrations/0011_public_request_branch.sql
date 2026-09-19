-- Lets a public join-form visitor pick which branch/campus they belong to.
-- get_public_join_form now also returns the org's branch list;
-- submit_member_request gains a branch_id param, validated against the
-- same organization before it's stored.

-- Postgres won't let CREATE OR REPLACE change a function's return type, and
-- adding a column to a RETURNS TABLE(...) counts as that — the old 4-column
-- version (from 0009) has to be dropped explicitly first.
drop function if exists public.get_public_join_form(text);

create or replace function public.get_public_join_form(org_slug text)
returns table (
  organization_id uuid,
  organization_name text,
  organization_logo_url text,
  field_definitions jsonb,
  branches jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select
    o.id,
    o.name,
    o.logo_url,
    coalesce(
      (select jsonb_agg(
          jsonb_build_object(
            'key', f.key,
            'label', f.label,
            'field_type', f.field_type,
            'options', f.options,
            'required', f.required
          )
          order by f.sort_order
        )
       from public.member_field_definitions f
       where f.organization_id = o.id),
      '[]'::jsonb
    ),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name)
       from public.branches b
       where b.organization_id = o.id),
      '[]'::jsonb
    )
  from public.organizations o
  where o.slug = org_slug;
$$;

create or replace function public.submit_member_request(
  org_slug text,
  first_name text,
  last_name text,
  phone text,
  email text default null,
  branch_id uuid default null,
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

  if branch_id is not null and not exists (
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

-- This time the parameter *count and types* actually change (added
-- branch_id uuid), so the old 6-arg signature is a distinct overload that
-- needs dropping explicitly — CREATE OR REPLACE won't touch it.
drop function if exists public.submit_member_request(text, text, text, text, text, jsonb);

grant execute on function public.get_public_join_form(text) to anon, authenticated;
grant execute on function public.submit_member_request(text, text, text, text, text, uuid, jsonb) to anon, authenticated;
