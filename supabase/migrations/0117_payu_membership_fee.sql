-- Phase 2 of the Razorpay-to-PayU migration: membership fees.
-- razorpay_order_id on membership_fee_invoices was already nullable (unlike
-- the add-on/event-registration tables), so this just adds the PayU columns
-- alongside it.
alter table public.membership_fee_invoices
  add column if not exists payu_txnid text null unique,
  add column if not exists payu_mihpayid text null;

-- Reversal (run manually if needed):
--   alter table public.membership_fee_invoices drop column if exists payu_mihpayid, drop column if exists payu_txnid;
