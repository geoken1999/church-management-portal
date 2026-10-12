-- A church's "own gateway" can now be Razorpay, PayU or Cashfree (it was
-- Razorpay only). Razorpay keys stay in organization_razorpay_accounts; PayU and
-- Cashfree credentials live here:
--   PayU     key_id = merchant key,  key_secret = salt
--   Cashfree key_id = App ID,        key_secret = secret key
-- Secrets are only ever read by the server (service role), so there is
-- deliberately no policy for signed-in users.
create table if not exists public.organization_gateway_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  gateway text not null check (gateway in ('payu', 'cashfree')),
  key_id text not null,
  key_secret text not null,
  environment text not null default 'live' check (environment in ('live', 'test')),
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, gateway)
);

drop trigger if exists set_organization_gateway_accounts_updated_at on public.organization_gateway_accounts;
create trigger set_organization_gateway_accounts_updated_at
  before update on public.organization_gateway_accounts
  for each row execute function public.set_updated_at();

alter table public.organization_gateway_accounts enable row level security;

-- Which gateway the church's own account uses for its own-mode gifts
-- (fundraisers and church-wide giving).
alter table public.organizations
  add column if not exists own_gateway text not null default 'razorpay' check (own_gateway in ('razorpay', 'payu', 'cashfree'));

-- Which provider took each payment, and Cashfree's order id.
alter table public.fundraiser_payment_orders
  add column if not exists gateway text not null default 'razorpay' check (gateway in ('razorpay', 'payu', 'cashfree')),
  add column if not exists cashfree_order_id text unique;

update public.fundraiser_payment_orders set gateway = 'payu' where payu_txnid is not null and gateway = 'razorpay';

-- Reversal (run manually if needed):
--   alter table public.fundraiser_payment_orders drop column if exists cashfree_order_id, drop column if exists gateway;
--   alter table public.organizations drop column if exists own_gateway;
--   drop table if exists public.organization_gateway_accounts;
