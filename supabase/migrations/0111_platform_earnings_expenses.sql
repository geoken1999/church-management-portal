-- Platform-level money: what KingdomFlow earns, and what it pays out to run.
--
-- Earnings come from three places. Add-on packs, the shared-account fundraiser
-- fee and the shared-account event fee are already recorded in their own
-- tables. Subscription charges were never stored (the webhook only updated the
-- subscription's status), so they are recorded here as they happen.
--
-- Both tables are written and read only through the service-role client (the
-- Razorpay webhook and the platform admin portal). RLS is enabled with no
-- client policies, so the browser cannot read or write them.

create table if not exists public.platform_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations (id) on delete set null,
  razorpay_subscription_id text not null,
  razorpay_payment_id text not null unique,
  plan_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'INR',
  paid_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists platform_subscription_payments_paid_at_idx
  on public.platform_subscription_payments (paid_at);

alter table public.platform_subscription_payments enable row level security;

-- Keep this list in step with PLATFORM_SERVICES in
-- src/lib/platform-admin/finance-config.ts.
create table if not exists public.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  service text not null check (
    service in ('supabase', 'vercel', 'razorpay_fees', 'meta_whatsapp', 'sms', 'email', 'ai', 'domain', 'other')
  ),
  description text not null check (length(trim(description)) > 0),
  vendor text null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'INR',
  paid_on date not null,
  reference text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_expenses_paid_on_idx on public.platform_expenses (paid_on);
create index if not exists platform_expenses_service_idx on public.platform_expenses (service, paid_on);

alter table public.platform_expenses enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.platform_expenses;
--   drop table if exists public.platform_subscription_payments;
