-- Phase 1 of the Razorpay-to-PayU migration: add-on pack purchases.
--
-- PayU has no server-side "create order" call, so there's no PayU-issued
-- order id to store before payment — this app generates its own txnid up
-- front (see createAddonOrder) and PayU's redirect-back result carries that
-- same txnid plus its own payment id (mihpayid) once paid. razorpay_order_id
-- is made nullable rather than dropped: no live Razorpay orders were ever
-- created (the account was never activated), so this is safe, and keeping
-- the column avoids touching anything else that still references it.
alter table public.organization_addon_orders
  alter column razorpay_order_id drop not null,
  add column if not exists payu_txnid text null unique,
  add column if not exists payu_mihpayid text null;

-- Reversal (run manually if needed):
--   alter table public.organization_addon_orders drop column if exists payu_mihpayid, drop column if exists payu_txnid;
--   alter table public.organization_addon_orders alter column razorpay_order_id set not null;
