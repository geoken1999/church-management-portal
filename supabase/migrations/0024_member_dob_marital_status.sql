-- Adds date of birth and marital status as default (not org-customizable)
-- member fields, plus a wedding date that's only meaningful — and only
-- required at the app/RPC layer — when marital status is "married".
--
-- All three are nullable at the DB level even though they're mandatory
-- going forward: retrofitting NOT NULL onto a table that may already have
-- rows isn't safe without a backfill value, and there's no sensible
-- universal default for a birth date. "Required" is enforced in the admin
-- form, the public join form, and this RPC — existing member records
-- without one simply won't have it until next edited.
alter table public.members
  add column if not exists date_of_birth date,
  add column if not exists marital_status text check (marital_status in ('married', 'unmarried')),
  add column if not exists wedding_date date;

-- date_of_birth/marital_status are new required params inserted ahead of
-- the existing defaulted ones (email, custom_fields) — not just appended —
-- so the old signature is a distinct overload and must be dropped first.
drop function if exists public.submit_member_request(text, text, text, text, uuid, text, jsonb);

create or replace function public.submit_member_request(
  org_slug text,
  first_name text,
  last_name text,
  phone text,
  branch_id uuid,
  date_of_birth date,
  marital_status text,
  email text default null,
  wedding_date date default null,
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

  if date_of_birth is null then
    raise exception 'Date of birth is required.';
  end if;
  if date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future.';
  end if;

  if marital_status is null or marital_status not in ('married', 'unmarried') then
    raise exception 'Please select a marital status.';
  end if;

  if marital_status = 'married' then
    if wedding_date is null then
      raise exception 'Wedding date is required when marital status is Married.';
    end if;
    if wedding_date > current_date then
      raise exception 'Wedding date cannot be in the future.';
    end if;
    if wedding_date < date_of_birth then
      raise exception 'Wedding date cannot be before the date of birth.';
    end if;
  else
    wedding_date := null;
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

  insert into public.members (
    organization_id, first_name, last_name, email, phone, branch_id,
    date_of_birth, marital_status, wedding_date, custom_fields, status
  )
  values (
    org_id,
    trim(first_name),
    trim(last_name),
    nullif(trim(email), ''),
    clean_phone,
    branch_id,
    date_of_birth,
    marital_status,
    wedding_date,
    coalesce(custom_fields, '{}'::jsonb),
    'pending'
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.submit_member_request(text, text, text, text, uuid, date, text, text, date, jsonb) to anon, authenticated;
