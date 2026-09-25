-- Accounting module: expense tracking plus a chart-of-accounts-lite for
-- categorizing both income and expense. Income itself isn't duplicated
-- here — the Accounting dashboard reads it straight from the existing
-- offerings/donations tables (see src/lib/accounting/dal.ts) rather than
-- requiring a second place to log the same gift. Same permission shape as
-- the rest of Finance: any member can view, only admins can manage by
-- default, delegable via the tab permissions matrix (migration 0040), and
-- gated by the Finance plan feature (Premium/Pro) at the app layer.

create table if not exists public.accounting_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, type)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.accounting_categories (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  payee text,
  expense_date date not null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'check', 'bank_transfer', 'online', 'other')),
  notes text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounting_categories_organization_id_idx on public.accounting_categories (organization_id);
create index if not exists expenses_organization_id_idx on public.expenses (organization_id);
create index if not exists expenses_expense_date_idx on public.expenses (expense_date);
create index if not exists expenses_branch_id_idx on public.expenses (branch_id);
create index if not exists expenses_category_id_idx on public.expenses (category_id);

drop trigger if exists set_accounting_categories_updated_at on public.accounting_categories;
create trigger set_accounting_categories_updated_at
  before update on public.accounting_categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Belt-and-braces, same pattern as attendance_sessions/fundraiser_payment_orders:
-- a category (if set) must belong to the same org, and must actually be an
-- 'expense'-typed category — picking an income category for an expense row
-- would silently corrupt the income/expense breakdown.
create or replace function public.check_expense_category_org()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.accounting_categories c
    where c.id = new.category_id and c.organization_id = new.organization_id and c.type = 'expense'
  ) then
    raise exception 'category_id must be an expense category belonging to the same organization';
  end if;
  return new;
end;
$$;

drop trigger if exists check_expense_category_org on public.expenses;
create trigger check_expense_category_org
  before insert or update of category_id, organization_id on public.expenses
  for each row execute function public.check_expense_category_org();

alter table public.accounting_categories enable row level security;
alter table public.expenses enable row level security;

-- accounting_categories
drop policy if exists "Members can view accounting categories" on public.accounting_categories;
create policy "Members can view accounting categories"
  on public.accounting_categories for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can add accounting categories" on public.accounting_categories;
create policy "Admins can add accounting categories"
  on public.accounting_categories for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update accounting categories" on public.accounting_categories;
create policy "Admins can update accounting categories"
  on public.accounting_categories for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete accounting categories" on public.accounting_categories;
create policy "Admins can delete accounting categories"
  on public.accounting_categories for delete to authenticated
  using (public.is_org_admin(organization_id));

-- expenses
drop policy if exists "Members can view expenses" on public.expenses;
create policy "Members can view expenses"
  on public.expenses for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can record expenses" on public.expenses;
create policy "Admins can record expenses"
  on public.expenses for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can update expenses" on public.expenses;
create policy "Admins can update expenses"
  on public.expenses for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "Admins can delete expenses" on public.expenses;
create policy "Admins can delete expenses"
  on public.expenses for delete to authenticated
  using (public.is_org_admin(organization_id));
