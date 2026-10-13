-- Volunteers can be verified by the church: an admin scans the volunteer's ID card QR
-- code, checks the details and marks them verified. The ID card then shows a Verified
-- tag until an admin removes it.
alter table public.volunteers
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles (auth_user_id) on delete set null;

-- The member's own card and the public check page now say whether they are verified.
drop function if exists public.get_my_volunteer();
create function public.get_my_volunteer()
returns table (
  volunteer_no text,
  role text,
  team text,
  joined_on date,
  status text,
  verify_token uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  date_of_birth date,
  membership_code text,
  organization_id uuid,
  organization_name text,
  logo_url text,
  branch_name text,
  verified boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select v.volunteer_no, v.role, v.team, v.joined_on, v.status, v.verify_token,
         m.first_name, m.last_name, m.phone, m.email, m.date_of_birth, m.membership_code,
         o.id, o.name, o.logo_url, b.name, v.verified
    from public.volunteers v
    join public.members m on m.id = v.member_id
    join public.organizations o on o.id = v.organization_id
    left join public.branches b on b.id = m.branch_id
   where m.auth_user_id = auth.uid()
   order by v.created_at asc
   limit 1;
$$;
grant execute on function public.get_my_volunteer() to authenticated;

drop function if exists public.verify_volunteer(uuid);
create function public.verify_volunteer(token uuid)
returns table (volunteer_no text, first_name text, last_name text, role text, team text, status text, organization_name text, logo_url text, verified boolean)
language sql
security definer
stable
set search_path = public
as $$
  select v.volunteer_no, m.first_name, m.last_name, v.role, v.team, v.status, o.name, o.logo_url, v.verified
    from public.volunteers v
    join public.members m on m.id = v.member_id
    join public.organizations o on o.id = v.organization_id
   where v.verify_token = token;
$$;
grant execute on function public.verify_volunteer(uuid) to anon, authenticated;

-- Reversal (run manually if needed): re-run the function definitions in 0166_volunteers.sql, then
--   alter table public.volunteers drop column if exists verified, drop column if exists verified_at, drop column if exists verified_by;
