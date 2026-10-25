-- Online giving (offerings, tithes and donations given through the church's giving link on KingdomFlow's shared
-- account, outside any fundraiser) is paid out to the church like the other shared-account streams: one balance per
-- church, payout requests, and payouts recorded by the platform.
create table if not exists public.giving_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  note text null,
  paid_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists giving_payouts_org_idx on public.giving_payouts (organization_id);
alter table public.giving_payouts enable row level security;
drop policy if exists "Org members can view giving payouts" on public.giving_payouts;
create policy "Org members can view giving payouts"
  on public.giving_payouts for select to authenticated
  using (public.is_org_member(organization_id));

create table if not exists public.giving_payout_requests (
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
  resolved_payout_id uuid null references public.giving_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists giving_payout_requests_one_pending_per_org
  on public.giving_payout_requests (organization_id)
  where status = 'pending';
alter table public.giving_payout_requests enable row level security;
drop policy if exists "Org members can view giving payout requests" on public.giving_payout_requests;
create policy "Org members can view giving payout requests"
  on public.giving_payout_requests for select to authenticated
  using (public.is_org_member(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.giving_payout_requests, public.giving_payouts;
