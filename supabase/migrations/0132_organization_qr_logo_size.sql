-- How large the church's QR centre logo is drawn, as a percentage of the
-- QR code's width (migration 0131 added the logo itself). Bounded so a
-- logo can never cover enough of the code, even at error correction level
-- H, to make it unreadable.
alter table public.organizations
  add column if not exists qr_logo_size smallint not null default 20
    check (qr_logo_size between 10 and 30);

-- Reversal (run manually if needed):
--   alter table public.organizations drop column if exists qr_logo_size;
