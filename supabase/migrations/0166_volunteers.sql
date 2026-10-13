-- Volunteers: members who serve the church in some way (ushers, sound, kitchen, ...),
-- each with a volunteer ID number and a digital ID card in the mobile app. The card
-- has a QR code that opens a public page confirming the person is an active
-- volunteer of the church (verify_token).
create table if not exists public.volunteers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- Set automatically: VOL-0001, VOL-0002, ... per church.
  volunteer_no text not null default '',
  role text not null check (length(trim(role)) >= 2),
  team text,
  joined_on date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  verify_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_id)
);

create index if not exists volunteers_organization_id_idx on public.volunteers (organization_id);

drop trigger if exists set_volunteers_updated_at on public.volunteers;
create trigger set_volunteers_updated_at
  before update on public.volunteers
  for each row execute function public.set_updated_at();

-- Numbers each church's volunteers one after another, without two at once getting the
-- same number.
create or replace function public.set_volunteer_number()
returns trigger
language plpgsql
as $$
declare
  next_number integer;
begin
  if new.volunteer_no is null or new.volunteer_no = '' then
    perform pg_advisory_xact_lock(hashtext('volunteer-no-' || new.organization_id::text));
    select coalesce(max(nullif(regexp_replace(volunteer_no, '\D', '', 'g'), '')::integer), 0) + 1
      into next_number
      from public.volunteers
     where organization_id = new.organization_id;
    new.volunteer_no := 'VOL-' || lpad(next_number::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists set_volunteers_number on public.volunteers;
create trigger set_volunteers_number
  before insert on public.volunteers
  for each row execute function public.set_volunteer_number();

alter table public.volunteers enable row level security;

drop policy if exists "Members can view volunteers" on public.volunteers;
create policy "Members can view volunteers"
  on public.volunteers for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add volunteers" on public.volunteers;
create policy "Admins can add volunteers"
  on public.volunteers for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update volunteers" on public.volunteers;
create policy "Admins can update volunteers"
  on public.volunteers for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can remove volunteers" on public.volunteers;
create policy "Admins can remove volunteers"
  on public.volunteers for delete to authenticated
  using (public.is_org_admin(organization_id));

-- The signed-in app member's own volunteer record, with what the ID card shows. A
-- member isn't a team login, so they can't read the table directly; this returns only
-- their own row (matched by the member record linked to their login).
create or replace function public.get_my_volunteer()
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
  branch_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select v.volunteer_no, v.role, v.team, v.joined_on, v.status, v.verify_token,
         m.first_name, m.last_name, m.phone, m.email, m.date_of_birth, m.membership_code,
         o.id, o.name, o.logo_url, b.name
    from public.volunteers v
    join public.members m on m.id = v.member_id
    join public.organizations o on o.id = v.organization_id
    left join public.branches b on b.id = m.branch_id
   where m.auth_user_id = auth.uid()
   order by v.created_at asc
   limit 1;
$$;

grant execute on function public.get_my_volunteer() to authenticated;

-- The volunteer page a card's QR code opens: confirms a volunteer is real and active.
-- Returns almost nothing about them (a name, the church and the role), and nothing
-- for a token that doesn't exist. Open to anyone with the link, like the church's other
-- public pages.
create or replace function public.verify_volunteer(token uuid)
returns table (volunteer_no text, first_name text, last_name text, role text, team text, status text, organization_name text, logo_url text)
language sql
security definer
stable
set search_path = public
as $$
  select v.volunteer_no, m.first_name, m.last_name, v.role, v.team, v.status, o.name, o.logo_url
    from public.volunteers v
    join public.members m on m.id = v.member_id
    join public.organizations o on o.id = v.organization_id
   where v.verify_token = token;
$$;

grant execute on function public.verify_volunteer(uuid) to anon, authenticated;

-- "volunteers" joins the features a church can pick for its mobile app (see 0087).
alter table public.organizations
  drop constraint if exists organizations_mobile_features_valid_keys,
  add constraint organizations_mobile_features_valid_keys check (
    mobile_features <@ array[
      'dashboard','profile','team','billing','branches',
      'members','leaders','youth','committee','volunteers','families',
      'ministries','worship','media','events','todos',
      'planner','forms','folder','attendance','reports','widget','accounting',
      'fundraisers','offerings','donations',
      'email','sms','whatsapp',
      'instagram','youtube','facebook',
      'documentation','support'
    ]::text[]
  );

-- Live updates in the app (see 0159).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'volunteers') then
    alter publication supabase_realtime add table public.volunteers;
  end if;
end $$;

-- Reversal (run manually if needed):
--   drop function if exists public.verify_volunteer(uuid);
--   drop function if exists public.get_my_volunteer();
--   drop table if exists public.volunteers;
--   drop function if exists public.set_volunteer_number();
