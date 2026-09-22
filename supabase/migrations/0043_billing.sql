-- Tracks each organization's Razorpay subscription, one row per org. The
-- webhook (src/app/api/razorpay/webhook) is the only writer after the
-- initial row is created by startSubscriptionCheckout — it's what keeps
-- this table (and organizations.plan) in sync with what Razorpay actually
-- charged, rather than trusting the client-side checkout callback.
create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  razorpay_customer_id text,
  razorpay_subscription_id text unique,
  plan_id text not null check (plan_id in ('basic', 'premium', 'pro')),
  status text not null default 'created' check (
    status in ('created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired')
  ),
  short_url text,
  current_start timestamptz,
  current_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_subscriptions_razorpay_subscription_id_idx
  on public.organization_subscriptions (razorpay_subscription_id);

drop trigger if exists set_organization_subscriptions_updated_at on public.organization_subscriptions;
create trigger set_organization_subscriptions_updated_at
  before update on public.organization_subscriptions
  for each row execute function public.set_updated_at();

alter table public.organization_subscriptions enable row level security;

-- Only admins/owners need to see billing state; writes happen exclusively
-- through the service-role client (checkout creation and the webhook), so
-- no insert/update/delete policy is defined for the client role at all.
drop policy if exists "Admins can view their subscription" on public.organization_subscriptions;
create policy "Admins can view their subscription"
  on public.organization_subscriptions for select to authenticated
  using (public.is_org_admin(organization_id));
