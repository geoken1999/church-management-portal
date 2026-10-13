-- The membership fee invoices table in some databases was created from an earlier version of
-- 0112 and never got the columns that record how a request, reminder and receipt were sent.
-- Without them a reminder or receipt goes out but can't be recorded. Safe to run anywhere.
alter table public.membership_fee_invoices
  add column if not exists request_via text null,
  add column if not exists reminder_via text null,
  add column if not exists receipt_sent_at timestamptz null,
  add column if not exists receipt_via text null;

alter table public.membership_fee_invoices drop constraint if exists membership_fee_invoices_request_via_check;
alter table public.membership_fee_invoices add constraint membership_fee_invoices_request_via_check check (request_via is null or request_via in ('shared', 'own'));
alter table public.membership_fee_invoices drop constraint if exists membership_fee_invoices_reminder_via_check;
alter table public.membership_fee_invoices add constraint membership_fee_invoices_reminder_via_check check (reminder_via is null or reminder_via in ('shared', 'own'));
alter table public.membership_fee_invoices drop constraint if exists membership_fee_invoices_receipt_via_check;
alter table public.membership_fee_invoices add constraint membership_fee_invoices_receipt_via_check check (receipt_via is null or receipt_via in ('shared', 'own'));

-- Tell the API to pick up the new columns straight away.
notify pgrst, 'reload schema';

-- Reversal (run manually if needed):
--   alter table public.membership_fee_invoices drop column if exists request_via, drop column if exists reminder_via, drop column if exists receipt_sent_at, drop column if exists receipt_via;
