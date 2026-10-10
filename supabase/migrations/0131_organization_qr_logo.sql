-- A church's own logo for the centre of the QR codes it shares and issues
-- (join link, event registration link, public forms, event passes, member
-- check-in code). Separate from logo_url so the QR can use a simpler mark
-- than the full church logo. Same public bucket as logo_url
-- ('organization-logos', object "{organization_id}/qr-logo"), so it counts
-- against the church's storage package the same way. Null = plain QR codes.
alter table public.organizations
  add column if not exists qr_logo_url text;

-- Reversal (run manually if needed):
--   alter table public.organizations drop column if exists qr_logo_url;
