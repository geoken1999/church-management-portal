-- Payroll and Budget planner, both part of Accounting (same "accounting" tab
-- permission). Payroll holds salary details, so the three payroll tables have RLS on
-- and no policies: they are read and written only by the server after it has
-- checked the person's Accounting access, never straight from a browser session.
-- Paying a payroll run records one ordinary expense per employee (category
-- "Salaries"), so the accounting totals and the budget's actuals pick it up.

create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  job_title text,
  branch_id uuid references public.branches (id) on delete set null,
  monthly_salary numeric(12, 2) not null check (monthly_salary >= 0),
  -- Added to / taken from the salary every month unless a run changes them.
  default_allowances numeric(12, 2) not null default 0 check (default_allowances >= 0),
  default_deductions numeric(12, 2) not null default 0 check (default_deductions >= 0),
  joined_on date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payroll_employees_organization_id_idx on public.payroll_employees (organization_id);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- "YYYY-MM"
  pay_month text not null check (pay_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'draft' check (status in ('draft', 'paid')),
  paid_on date,
  payment_method text check (payment_method in ('cash', 'check', 'bank_transfer', 'online', 'other')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, pay_month)
);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid references public.payroll_employees (id) on delete set null,
  -- Copied when the run is made, so an old payslip still reads right after an employee is renamed or removed.
  employee_name text not null,
  job_title text,
  basic numeric(12, 2) not null check (basic >= 0),
  allowances numeric(12, 2) not null default 0 check (allowances >= 0),
  deductions numeric(12, 2) not null default 0 check (deductions >= 0),
  net numeric(12, 2) not null check (net >= 0),
  expense_id uuid references public.expenses (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payroll_entries_run_id_idx on public.payroll_entries (run_id);
create index if not exists payroll_entries_organization_id_idx on public.payroll_entries (organization_id);

drop trigger if exists set_payroll_employees_updated_at on public.payroll_employees;
create trigger set_payroll_employees_updated_at before update on public.payroll_employees
  for each row execute function public.set_updated_at();
drop trigger if exists set_payroll_runs_updated_at on public.payroll_runs;
create trigger set_payroll_runs_updated_at before update on public.payroll_runs
  for each row execute function public.set_updated_at();

alter table public.payroll_employees enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_entries enable row level security;

-- Budget: what the church plans to spend on an expense category in a month.
create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- "YYYY-MM"
  budget_month text not null check (budget_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  category_id uuid not null references public.accounting_categories (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, budget_month, category_id)
);
create index if not exists budget_lines_organization_month_idx on public.budget_lines (organization_id, budget_month);

drop trigger if exists set_budget_lines_updated_at on public.budget_lines;
create trigger set_budget_lines_updated_at before update on public.budget_lines
  for each row execute function public.set_updated_at();

alter table public.budget_lines enable row level security;

drop policy if exists "Members can view budget lines" on public.budget_lines;
create policy "Members can view budget lines"
  on public.budget_lines for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can manage budget lines" on public.budget_lines;
create policy "Admins can manage budget lines"
  on public.budget_lines for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
