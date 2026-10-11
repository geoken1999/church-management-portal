-- An unguessable token for each registration's public "view your pass"
-- page (/pass/{token}), linked from the WhatsApp pass message. The short,
-- human-typeable confirmation_code is deliberately NOT used in that link:
-- it is easy to guess, and the page shows the registrant's name. The
-- volatile default backfills a distinct token for every existing row.
alter table public.event_registrations
  add column if not exists pass_token uuid not null default gen_random_uuid();

create unique index if not exists event_registrations_pass_token_key
  on public.event_registrations (pass_token);

-- Reversal (run manually if needed):
--   drop index if exists public.event_registrations_pass_token_key;
--   alter table public.event_registrations drop column if exists pass_token;
