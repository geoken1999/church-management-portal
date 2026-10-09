-- Phase 3 of the Razorpay-to-PayU migration: plan subscriptions.
--
-- Unlike every other PayU flow migrated so far (all one-time payments),
-- recurring billing has no single-call equivalent to Razorpay's
-- subscriptions.create — PayU's model is: register a UPI Autopay mandate
-- once (via the same hash-checkout _payment endpoint everything else
-- uses, with si=1 + si_details), then THIS APP proactively calls PayU's
-- Recurring Payment Transaction API each billing cycle rather than PayU
-- auto-charging and pushing a webhook the way Razorpay Subscriptions does.
-- next_charge_at/predebit_notice_sent_at exist because of that — see the
-- new subscription-billing cron.
--
-- razorpay_subscription_id etc. are left in place, untouched: a church
-- already on a Razorpay-based subscription keeps working exactly as
-- before (its lifecycle is still driven by the Razorpay webhook). Only
-- NEW checkouts use the PayU columns from here on.
alter table public.organization_subscriptions
  add column if not exists payu_txnid text null unique,
  -- The mihpayid from the mandate-registration transaction — PayU's Recurring
  -- Payment Transaction API calls this "authpayuid" and requires it to
  -- charge against this mandate.
  add column if not exists payu_authpayuid text null,
  add column if not exists payu_vpa text null,
  add column if not exists next_charge_at timestamptz null,
  add column if not exists predebit_notice_sent_at timestamptz null,
  -- Consecutive failed recurring-charge attempts — halted after
  -- MAX_CONSECUTIVE_CHARGE_FAILURES (see subscription-billing cron), same
  -- 'halted' status Razorpay subscriptions already use for this.
  add column if not exists consecutive_charge_failures int not null default 0;

-- One row per recurring-charge attempt this app made (distinct from the
-- one-time mandate registration itself) — Razorpay pushed charge events
-- via webhook with nothing for this app to initiate or log; here, this
-- app owns calling the charge API, so it owns recording what happened.
create table if not exists public.subscription_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions (id) on delete cascade,
  txnid text not null unique,
  amount numeric not null,
  status text not null check (status in ('charged', 'failed')),
  payu_response jsonb,
  charged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscription_charges_subscription_id_idx
  on public.subscription_charges (subscription_id);
create index if not exists subscription_charges_organization_id_idx
  on public.subscription_charges (organization_id);

alter table public.subscription_charges enable row level security;

-- Read-only for admins, same as organization_subscriptions itself; all
-- writes are service-role only (the subscription-billing cron).
drop policy if exists "Admins can view their subscription charges" on public.subscription_charges;
create policy "Admins can view their subscription charges"
  on public.subscription_charges for select to authenticated
  using (public.is_org_admin(organization_id));

-- Reversal (run manually if needed):
--   drop table if exists public.subscription_charges;
--   alter table public.organization_subscriptions
--     drop column if exists consecutive_charge_failures,
--     drop column if exists predebit_notice_sent_at,
--     drop column if exists next_charge_at,
--     drop column if exists payu_vpa,
--     drop column if exists payu_authpayuid,
--     drop column if exists payu_txnid;
