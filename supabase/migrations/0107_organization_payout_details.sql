-- Where the platform should actually wire payout money — UPI ID or bank
-- account details. One shared, org-level profile (a church has one bank
-- account regardless of whether the money came from a Fund Raiser or a
-- paid event), savable from either payout-request flow or from a
-- standalone settings panel (Billing page).
--
-- RLS mirrors fundraiser_payouts/fundraiser_payout_requests, not the
-- stricter organization_razorpay_accounts: a bank account number + IFSC
-- is informational (it tells you where to send money, it doesn't grant
-- control of anything), so any org member can view it, only admins can
-- write it.
create table if not exists public.organization_payout_details (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  payout_method text not null check (payout_method in ('upi', 'bank_transfer')),
  upi_id text,
  bank_account_holder text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_payout_details_fields_check check (
    (payout_method = 'upi' and upi_id is not null)
    or (payout_method = 'bank_transfer' and bank_account_holder is not null and bank_account_number is not null and bank_ifsc is not null and bank_name is not null)
  )
);

drop trigger if exists set_organization_payout_details_updated_at on public.organization_payout_details;
create trigger set_organization_payout_details_updated_at
  before update on public.organization_payout_details
  for each row execute function public.set_updated_at();

alter table public.organization_payout_details enable row level security;

drop policy if exists "Org members can view payout details" on public.organization_payout_details;
create policy "Org members can view payout details"
  on public.organization_payout_details for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Admins can manage payout details" on public.organization_payout_details;
create policy "Admins can manage payout details"
  on public.organization_payout_details for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Snapshot of the same fields onto each request — the org's saved
-- profile can change between when a payout is requested and when it's
-- actually fulfilled, so the request needs to carry its own fixed copy
-- of where that specific payout should go. Nullable: existing requests
-- from before this feature just have nulls.
alter table public.fundraiser_payout_requests
  add column if not exists payout_method text check (payout_method is null or payout_method in ('upi', 'bank_transfer')),
  add column if not exists upi_id text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_name text;

alter table public.event_payout_requests
  add column if not exists payout_method text check (payout_method is null or payout_method in ('upi', 'bank_transfer')),
  add column if not exists upi_id text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_name text;
