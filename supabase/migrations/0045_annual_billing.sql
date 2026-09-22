-- Tracks whether a subscription is billed monthly or annually (10% off,
-- see ANNUAL_DISCOUNT in src/lib/plans/config.ts). Defaults existing rows
-- to 'monthly' since that's the only cadence that existed before this.
alter table public.organization_subscriptions
  add column if not exists billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'annual'));
