-- Splits the "shared" AI Rules categories so Instagram and WhatsApp can be
-- controlled independently, rather than one combined toggle covering both
-- bots at once (e.g. "share fundraisers via Instagram but not WhatsApp").
--
-- Ministries/branches/forms have no Ask Aura tool at all (Aura never had
-- an equivalent), so their old single column only ever meant "both bots
-- together" — replaced outright with an _instagram/_whatsapp pair.
-- Fundraisers/events DO have an Ask Aura tool (list_fundraisers/
-- list_upcoming_events), so their existing column is kept exactly as-is
-- (still gates Aura) and new _instagram/_whatsapp columns are added
-- alongside it for the bots, independent of Aura's own access.
--
-- This table shipped minutes before this migration with no real usage
-- yet, so a clean column replacement (rather than preserving old values
-- into new columns) is safe — nothing meaningful would be lost.
alter table public.ai_data_access_rules
  drop column if exists allow_ministries,
  drop column if exists allow_branches,
  drop column if exists allow_forms,
  add column if not exists allow_fundraisers_instagram boolean not null default true,
  add column if not exists allow_fundraisers_whatsapp boolean not null default true,
  add column if not exists allow_events_instagram boolean not null default true,
  add column if not exists allow_events_whatsapp boolean not null default true,
  add column if not exists allow_ministries_instagram boolean not null default true,
  add column if not exists allow_ministries_whatsapp boolean not null default true,
  add column if not exists allow_branches_instagram boolean not null default true,
  add column if not exists allow_branches_whatsapp boolean not null default true,
  add column if not exists allow_forms_instagram boolean not null default true,
  add column if not exists allow_forms_whatsapp boolean not null default true;
