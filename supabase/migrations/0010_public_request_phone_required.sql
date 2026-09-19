-- Phone becomes required on the public join form specifically (the admin
-- add/edit member form still leaves it optional — family members often
-- share one household number when an admin enters them manually).
-- Also blocks a second public submission reusing a phone number already on
-- file for the same organization, active/left/pending alike, to cut down on
-- duplicate/spam requests through that one public entry point. This is a
-- restriction on submit_member_request() only, not a table-wide constraint
-- — admins can still enter the same phone number twice on purpose.

create or replace function public.submit_member_request(
  org_slug text,
  first_name text,
  last_name text,
  phone text,
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

  insert into public.members (organization_id, first_name, last_name, email, phone, custom_fields, status)
  values (
    org_id,
    trim(first_name),
    trim(last_name),
    nullif(trim(email), ''),
    clean_phone,
    coalesce(custom_fields, '{}'::jsonb),
    'pending'
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- No DROP needed: the parameter *types* are still (text, text, text, text,
-- text, jsonb), same as the 0009 version, so CREATE OR REPLACE updates it in
-- place rather than creating an overload. Reordering "phone" before "email"
-- is safe because every caller (supabase-js) invokes this by named args,
-- not position.
grant execute on function public.submit_member_request(text, text, text, text, text, jsonb) to anon, authenticated;
