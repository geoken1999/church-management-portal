-- Monthly church reports: a snapshot of how the church did in one month (members,
-- attendance, events, giving, expenses, volunteers, prayer), generated on the web's
-- Reports page. The numbers are saved when the report is made, so it never changes
-- later. An owner or admin can publish a report to the app, where members see it
-- under Explore -> Reports. Only totals are saved: never who gave what.
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- 'YYYY-MM'
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title text not null,
  note text,
  data jsonb not null default '{}'::jsonb,
  published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, period)
);

create index if not exists monthly_reports_org_period_idx on public.monthly_reports (organization_id, period desc);

drop trigger if exists set_monthly_reports_updated_at on public.monthly_reports;
create trigger set_monthly_reports_updated_at
  before update on public.monthly_reports
  for each row execute function public.set_updated_at();

alter table public.monthly_reports enable row level security;

-- The church's team can read its reports; writes go through the server, which checks
-- the Reports tab's permission.
drop policy if exists "Team members can view monthly reports" on public.monthly_reports;
create policy "Team members can view monthly reports"
  on public.monthly_reports for select to authenticated
  using (public.is_org_member(organization_id));

-- The published reports of the church the signed-in app member belongs to. A member
-- isn't a team login, so they can't read the table; this returns only published ones.
create or replace function public.get_published_reports()
returns table (id uuid, period text, title text, note text, data jsonb, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select r.id, r.period, r.title, r.note, r.data, r.created_at
    from public.monthly_reports r
   where r.published
     and r.organization_id in (select m.organization_id from public.members m where m.auth_user_id = auth.uid() and m.status = 'active')
   order by r.period desc
   limit 36;
$$;

grant execute on function public.get_published_reports() to authenticated;

-- Live updates in the app (see 0159).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'monthly_reports') then
    alter publication supabase_realtime add table public.monthly_reports;
  end if;
end $$;

-- Reversal (run manually if needed):
--   drop function if exists public.get_published_reports();
--   drop table if exists public.monthly_reports;
