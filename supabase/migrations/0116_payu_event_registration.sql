-- Phase 2 of the Razorpay-to-PayU migration: paid event registration.
-- Same reasoning as migration 0115 (add-on packs): no live Razorpay orders
-- were ever created, so making razorpay_order_id nullable and adding the
-- PayU columns alongside is safe.
alter table public.event_registration_payment_orders
  alter column razorpay_order_id drop not null,
  add column if not exists payu_txnid text null unique,
  add column if not exists payu_mihpayid text null;

-- Reversal (run manually if needed):
--   alter table public.event_registration_payment_orders drop column if exists payu_mihpayid, drop column if exists payu_txnid;
--   alter table public.event_registration_payment_orders alter column razorpay_order_id set not null;
