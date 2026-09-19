-- Public "request to join" form: an admin shares /join/{organization slug},
-- visitors submit their basic details (no login), and the request lands as
-- a `members` row with status='pending' for an admin to approve or reject
-- (reject = delete, reusing the existing delete action).
--
-- Writes go through submit_member_request() only — there is no direct RLS
-- grant for anon on public.members — so an anonymous caller can never set
-- anything but 'pending', and every insert is tied to a real organization
-- looked up by slug inside the function, never a client-supplied id.

alter table public.members
  drop constraint if exists members_status_check,
  add constraint members_status_check check (status in ('active', 'left', 'pending'));

-- Minimal public info + the form schema for a church's join page. Read-only
-- and scoped to one organization by slug, so it doesn't expose the
-- organizations table (or member_field_definitions) to anon wholesale.
create or replace function public.get_public_join_form(org_slug text)
returns table (
  organization_id uuid,
  organization_name text,
  organization_logo_url text,
  field_definitions jsonb
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
    )
  from public.organizations o
  where o.slug = org_slug;
$$;

create or replace function public.submit_member_request(
  org_slug text,
  first_name text,
  last_name text,
  email text default null,
  phone text default null,
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
    nullif(trim(phone), ''),
    coalesce(custom_fields, '{}'::jsonb),
    'pending'
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.get_public_join_form(text) to anon, authenticated;
grant execute on function public.submit_member_request(text, text, text, text, text, jsonb) to anon, authenticated;
