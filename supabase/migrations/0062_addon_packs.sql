-- Add-on packs — one-time top-ups an org can buy on top of their plan's
-- monthly SMS/Email/WhatsApp quota or storage limit (e.g. "out of SMS this
-- month, need 500 more now" without upgrading the whole plan). Credits are
-- a running balance that never auto-resets — see checkSmsQuota et al. in
-- plans/dal.ts for how they're drawn down after the plan's own monthly
-- quota is exhausted. Storage credits are simpler: they just raise the
-- plan's storage ceiling permanently, since storage usage is already a
-- live total rather than a monthly counter.
alter table public.organizations
  add column if not exists addon_sms_credits integer not null default 0,
  add column if not exists addon_email_credits integer not null default 0,
  add column if not exists addon_whatsapp_credits integer not null default 0,
  add column if not exists addon_storage_bytes bigint not null default 0;

-- One row per purchase attempt — mirrors fundraiser_payment_orders
-- (migration 0054): created when checkout starts, claimed 'paid' by
-- whichever of the Checkout success callback or the Razorpay webhook
-- fires first (see finalizeAddonOrderPayment's atomic claim). credits is a
-- message count for sms/email/whatsapp, or a byte count for storage.
create table if not exists public.organization_addon_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  addon_type text not null check (addon_type in ('sms', 'email', 'whatsapp', 'storage')),
  pack_id text not null,
  credits bigint not null check (credits > 0),
  amount numeric not null check (amount > 0),
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  status text not null default 'created' check (status in ('created', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists organization_addon_orders_organization_id_idx
  on public.organization_addon_orders (organization_id);

alter table public.organization_addon_orders enable row level security;

-- Same reasoning as organization_subscriptions (migration 0043): only
-- admins/owners need to see billing history; every write happens through
-- the service-role client (order creation and the webhook/checkout
-- confirmation), so no insert/update/delete policy exists for the client
-- role at all.
drop policy if exists "Admins can view their addon orders" on public.organization_addon_orders;
create policy "Admins can view their addon orders"
  on public.organization_addon_orders for select to authenticated
  using (public.is_org_admin(organization_id));
