-- Every tax invoice is also emailed to the platform owner's own address (INVOICE_COPY_EMAIL, or the invoice
-- template's email). This records that the copy went, so a resend to the church doesn't send it twice.
alter table public.platform_invoices
  add column if not exists copy_emailed_at timestamptz;

-- Reversal (run manually if needed):
--   alter table public.platform_invoices drop column if exists copy_emailed_at;
