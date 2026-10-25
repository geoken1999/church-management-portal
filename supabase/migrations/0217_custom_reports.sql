-- Custom reports: a church builds its own report from one of the standard data sources (which columns, which filters,
-- which date window), saves it, and can schedule it to arrive in people's email as an Excel or PDF file.
create table if not exists public.custom_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  -- A report id of src/lib/reports/registry.ts: members, attendance, events, offerings, donations.
  source text not null,
  -- The columns to include, in the order to show them.
  columns text[] not null default '{}',
  -- { branchId?, status?, method? }; the dates come from date_window so a scheduled run always looks at fresh dates.
  filters jsonb not null default '{}'::jsonb,
  date_window text not null default 'all'
    check (date_window in ('all', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'this_year', 'custom')),
  date_from date,
  date_to date,
  format text not null default 'excel' check (format in ('excel', 'pdf')),
  frequency text not null default 'none' check (frequency in ('none', 'daily', 'weekly', 'monthly')),
  -- Weekly: 0 (Sunday) to 6. Monthly: 1 to 28.
  schedule_day smallint,
  recipients text[] not null default '{}',
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_reports_org_idx on public.custom_reports (organization_id);
create index if not exists custom_reports_due_idx on public.custom_reports (frequency) where frequency <> 'none';

drop trigger if exists set_custom_reports_updated_at on public.custom_reports;
create trigger set_custom_reports_updated_at
  before update on public.custom_reports
  for each row execute function public.set_updated_at();

alter table public.custom_reports enable row level security;

-- The app reads and writes through the server (service role) after checking the Reports permission; owners and
-- admins may also read them directly.
drop policy if exists "Admins can view custom reports" on public.custom_reports;
create policy "Admins can view custom reports"
  on public.custom_reports for select to authenticated
  using (public.is_org_admin(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.custom_reports;
