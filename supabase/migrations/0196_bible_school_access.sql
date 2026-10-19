-- Bible School is set up per church, on request (like live streaming): a church asks, the team turns it on
-- by hand. No row means the church has not asked and cannot use it.
create table if not exists public.bible_school_access (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  requested_at timestamptz,
  requested_by uuid references public.profiles (auth_user_id) on delete set null,
  enabled_at timestamptz,
  -- For the team: what was agreed, and how it is billed.
  note text,
  updated_at timestamptz not null default now()
);

alter table public.bible_school_access enable row level security;

drop policy if exists "Team can see their church's bible school access" on public.bible_school_access;
create policy "Team can see their church's bible school access"
  on public.bible_school_access for select to authenticated
  using (public.is_org_member(organization_id));
-- No other policy: requests and approvals are written by the server (service role) only.

-- Churches that already built courses while this was in testing keep using it.
insert into public.bible_school_access (organization_id, enabled, enabled_at, note)
select distinct organization_id, true, now(), 'Enabled automatically: had courses before access was by request.'
from public.lms_courses
on conflict (organization_id) do nothing;

-- The app and the database functions now also need the church's access switched on.
create or replace function public.lms_feature_available(p_org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select f.enabled and f.status in ('beta', 'live') from public.platform_feature_flags f where f.tab_key = 'bibleschool'), false)
     and coalesce((select (o.custom_plan_limits -> 'tabOverrides' ->> 'bibleschool')::boolean from public.organizations o where o.id = p_org), true)
     and coalesce((select a.enabled from public.bible_school_access a where a.organization_id = p_org), false);
$$;
revoke all on function public.lms_feature_available(uuid) from public, anon, authenticated;

-- Reversal (run manually if needed): re-run the lms_feature_available definition from 0191, then
--   drop table if exists public.bible_school_access;
