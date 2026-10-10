-- Opt-in per event: also send each registrant's pass on WhatsApp (the same
-- QR pass that is emailed), as an approved template with the QR as its
-- header image. Off by default: it uses the church's WhatsApp quota, and
-- needs a phone number in the registration form.
alter table public.events
  add column if not exists registration_pass_whatsapp boolean not null default false;

-- Reversal (run manually if needed):
--   alter table public.events drop column if exists registration_pass_whatsapp;
