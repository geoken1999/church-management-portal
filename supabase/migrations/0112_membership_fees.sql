-- Monthly membership fees: each active member gets a payment link for a fixed
-- amount on a set day each month. Payments go through the platform's shared
-- Razorpay account, so the church is paid out through a payout request the same
-- way fundraiser and event money is (2.5% fee, admin wires the balance).
--
-- Writes to these tables come only from the server (service role): the monthly
-- cron, the public payment page, and the Razorpay webhook. Members can't write
-- them directly.

create table if not exists public.membership_fee_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  amount numeric(10, 2) null check (amount is null or amount > 0),
  -- Day of the month the fee requests go out, in the organization's timezone.
  -- Capped at 28 so every month has the day.
  due_day smallint not null default 1 check (due_day between 1 and 28),
  reminder_after_days smallint not null default 7 check (reminder_after_days between 1 and 28),
  updated_by uuid null references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.membership_fee_settings enable row level security;

drop policy if exists "Org members can view membership fee settings" on public.membership_fee_settings;
create policy "Org members can view membership fee settings"
  on public.membership_fee_settings for select to authenticated
  using (public.is_org_member(organization_id));

create table if not exists public.membership_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- 'YYYY-MM' in the organization's timezone.
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  -- Snapshot of the amount at the time the request was made, so changing the
  -- fee later doesn't change what an open request asks for.
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'due' check (status in ('due', 'paid', 'cancelled')),
  -- Unguessable token for the public payment link.
  public_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  razorpay_order_id text null unique,
  razorpay_payment_id text null,
  paid_at timestamptz null,
  request_sent_at timestamptz null,
  -- 'shared' = KingdomFlow's sender (counts against the plan's email allowance);
  -- 'own' = the church's own SMTP (doesn't).
  request_via text null check (request_via is null or request_via in ('shared', 'own')),
  reminder_sent_at timestamptz null,
  reminder_via text null check (reminder_via is null or reminder_via in ('shared', 'own')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One fee per member per month. This is what makes the monthly run safe to repeat.
  unique (organization_id, member_id, period)
);

create index if not exists membership_fee_invoices_org_period_idx on public.membership_fee_invoices (organization_id, period);

drop trigger if exists set_membership_fee_invoices_updated_at on public.membership_fee_invoices;
create trigger set_membership_fee_invoices_updated_at
  before update on public.membership_fee_invoices
  for each row execute function public.set_updated_at();

alter table public.membership_fee_invoices enable row level security;

drop policy if exists "Org members can view membership fee invoices" on public.membership_fee_invoices;
create policy "Org members can view membership fee invoices"
  on public.membership_fee_invoices for select to authenticated
  using (public.is_org_member(organization_id));

create table if not exists public.membership_payout_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  payout_method text not null check (payout_method in ('upi', 'bank_transfer')),
  upi_id text null,
  bank_account_holder text null,
  bank_account_number text null,
  bank_ifsc text null,
  bank_name text null,
  requested_by uuid null references auth.users (id) on delete set null,
  resolved_payout_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open request per organization at a time, same rule as fundraiser payouts.
create unique index if not exists membership_payout_requests_one_pending_per_org
  on public.membership_payout_requests (organization_id)
  where status = 'pending';

alter table public.membership_payout_requests enable row level security;

drop policy if exists "Org members can view membership payout requests" on public.membership_payout_requests;
create policy "Org members can view membership payout requests"
  on public.membership_payout_requests for select to authenticated
  using (public.is_org_member(organization_id));

create table if not exists public.membership_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text null,
  paid_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists membership_payouts_org_idx on public.membership_payouts (organization_id);

alter table public.membership_payouts enable row level security;

drop policy if exists "Org members can view membership payouts" on public.membership_payouts;
create policy "Org members can view membership payouts"
  on public.membership_payouts for select to authenticated
  using (public.is_org_member(organization_id));

alter table public.membership_payout_requests
  add constraint membership_payout_requests_resolved_fk
  foreign key (resolved_payout_id) references public.membership_payouts (id) on delete set null;

-- Reversal (run manually if needed):
--   alter table public.membership_payout_requests drop constraint if exists membership_payout_requests_resolved_fk;
--   drop table if exists public.membership_payouts;
--   drop table if exists public.membership_payout_requests;
--   drop table if exists public.membership_fee_invoices;
--   drop table if exists public.membership_fee_settings;
