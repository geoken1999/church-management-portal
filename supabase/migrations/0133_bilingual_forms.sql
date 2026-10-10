-- Bilingual forms: a form can show two of the app's languages at once
-- ("Name / नाम"). Each column holds a BilingualConfig
-- (src/lib/bilingual/config.ts): { source, target, translations } where
-- translations maps the admin's text to its automatic translation. Null =
-- single-language, as before. Public pages read this with the service role
-- on the server, so none of the public RPCs had to change.
alter table public.forms add column if not exists bilingual jsonb;
alter table public.events add column if not exists registration_bilingual jsonb;
alter table public.organizations add column if not exists join_bilingual jsonb;

-- Reversal (run manually if needed):
--   alter table public.forms drop column if exists bilingual;
--   alter table public.events drop column if exists registration_bilingual;
--   alter table public.organizations drop column if exists join_bilingual;
