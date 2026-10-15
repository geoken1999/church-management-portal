-- Onboarding has two kinds: "package" (the tenant picks Basic/Premium/Pro themselves, so onboarding
-- is only the legal documents) and "custom" (documents, then modules and monthly credit allowances
-- priced by the platform admin, then a subscription for the total).
alter table public.tenant_onboarding
  add column if not exists plan_type text not null default 'package' check (plan_type in ('package', 'custom')),
  -- Monthly allowances for a custom plan: { "sms": { "count": 5000, "price": 800 }, ... }, price before GST.
  add column if not exists credits jsonb not null default '{}'::jsonb;

-- Already-created onboardings were all custom ones (modules and pricing was the only flow).
update public.tenant_onboarding set plan_type = 'custom' where plan_type = 'package';

alter table public.organization_subscriptions
  add column if not exists onboarding_credits jsonb null;

-- Reversal (run manually if needed):
--   alter table public.organization_subscriptions drop column if exists onboarding_credits;
--   alter table public.tenant_onboarding drop column if exists credits, drop column if exists plan_type;
