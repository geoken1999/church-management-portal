-- Tenant onboarding, run by the platform admin: legal documents collected, the modules the tenant
-- opts for (priced per module), then a subscription for the total set up through the payment gateway.
-- Only the server (service role) touches these tables, so there are no policies on purpose.

-- What each module costs per month (before 18% GST), and which ones start ticked for every
-- onboarding. Keys are the module keys in src/lib/onboarding/config.ts.
create table if not exists public.module_pricing (
  module_key text primary key,
  monthly_price numeric not null default 0 check (monthly_price >= 0),
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.module_pricing enable row level security;

-- One onboarding per tenant.
create table if not exists public.tenant_onboarding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- in_progress: being set up; awaiting_payment: sent to the tenant, waiting for them to authorize
  -- the subscription; active: paid and the modules are switched on.
  status text not null default 'in_progress' check (status in ('in_progress', 'awaiting_payment', 'active')),
  modules text[] not null default '{}',
  -- Monthly price of the chosen modules before GST, as quoted when it was sent.
  monthly_base numeric not null default 0,
  notes text not null default '',
  started_by uuid references public.profiles (auth_user_id) on delete set null,
  sent_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_onboarding enable row level security;

-- Legal documents for a tenant. Files are in the private onboarding-documents bucket.
create table if not exists public.tenant_onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  doc_type text not null,
  file_name text not null,
  file_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'verified', 'rejected')),
  note text not null default '',
  uploaded_by uuid references public.profiles (auth_user_id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tenant_onboarding_documents_org_idx on public.tenant_onboarding_documents (organization_id);
alter table public.tenant_onboarding_documents enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding-documents', 'onboarding-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- A subscription set up from an onboarding is billed this monthly amount (before GST) instead of a
-- plan's price, for these modules.
alter table public.organization_subscriptions
  add column if not exists monthly_amount numeric null,
  add column if not exists onboarding_modules text[] null;

-- Reversal (run manually if needed):
--   alter table public.organization_subscriptions drop column if exists monthly_amount, drop column if exists onboarding_modules;
--   drop table if exists public.tenant_onboarding_documents;
--   drop table if exists public.tenant_onboarding;
--   drop table if exists public.module_pricing;
--   delete from storage.buckets where id = 'onboarding-documents';
