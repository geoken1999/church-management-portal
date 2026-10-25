-- A church can subscribe to one module its plan doesn't include (Automations on Starter, say), at the module's own
-- monthly price, separately from its plan. Each module is its own Razorpay subscription, billed monthly with GST like
-- the plan. organizations.addon_modules is the list of modules currently paid for, kept in step by the trigger below,
-- so the rest of the app reads access from one place.
create table if not exists public.organization_module_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- A key of the onboarding module list (src/lib/onboarding/config.ts): "automations", "finance", "social", ...
  module_key text not null,
  status text not null default 'created'
    check (status in ('created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired')),
  razorpay_subscription_id text unique,
  razorpay_customer_id text,
  -- The monthly price before GST, as it was when they subscribed (a later price change doesn't change it).
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  short_url text,
  current_start timestamptz,
  current_end timestamptz,
  next_charge_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, module_key)
);

create index if not exists organization_module_subscriptions_org_idx on public.organization_module_subscriptions (organization_id);

drop trigger if exists set_organization_module_subscriptions_updated_at on public.organization_module_subscriptions;
create trigger set_organization_module_subscriptions_updated_at
  before update on public.organization_module_subscriptions
  for each row execute function public.set_updated_at();

alter table public.organization_module_subscriptions enable row level security;

-- Owners and admins can see their church's module subscriptions; the server (service role) writes them.
drop policy if exists "Admins can view module subscriptions" on public.organization_module_subscriptions;
create policy "Admins can view module subscriptions"
  on public.organization_module_subscriptions for select to authenticated
  using (public.is_org_admin(organization_id));

alter table public.organizations
  add column if not exists addon_modules text[] not null default '{}';

-- Modules paid for right now: an active subscription, or one whose latest charge is being retried. A halted,
-- cancelled, completed or expired one is not.
create or replace function public.sync_addon_modules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.organization_id, old.organization_id);
begin
  update public.organizations o
  set addon_modules = coalesce(
    (select array_agg(s.module_key order by s.module_key)
       from public.organization_module_subscriptions s
      where s.organization_id = target and s.status in ('active', 'pending')),
    '{}'
  )
  where o.id = target;
  return null;
end;
$$;

drop trigger if exists sync_addon_modules on public.organization_module_subscriptions;
create trigger sync_addon_modules
  after insert or update of status or delete on public.organization_module_subscriptions
  for each row execute function public.sync_addon_modules();

-- Reversal (run manually if needed):
--   drop trigger if exists sync_addon_modules on public.organization_module_subscriptions;
--   drop function if exists public.sync_addon_modules();
--   alter table public.organizations drop column if exists addon_modules;
--   drop table if exists public.organization_module_subscriptions;
