-- Phase 2 of the Razorpay-to-PayU migration: fundraiser giving, 'shared'
-- mode only. 'own' mode (a church's own Razorpay keys) is explicitly staying
-- on Razorpay for now — it isn't a PayU-approval-gated product the platform
-- can set up on a church's behalf the way 'shared' is, so razorpay_order_id
-- stays in active use for those orders. This just makes it optional so
-- 'shared'-mode orders (which now get a payu_txnid instead) can omit it.
alter table public.fundraiser_payment_orders
  alter column razorpay_order_id drop not null,
  add column if not exists payu_txnid text null unique,
  add column if not exists payu_mihpayid text null;

-- Reversal (run manually if needed):
--   alter table public.fundraiser_payment_orders drop column if exists payu_mihpayid, drop column if exists payu_txnid;
--   alter table public.fundraiser_payment_orders alter column razorpay_order_id set not null;
