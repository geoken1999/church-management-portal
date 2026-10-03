-- Ask Aura gains its own tools for ministries, branches, and forms (see
-- src/lib/aura/tools.ts), completing the full category set it can access
-- — previously it had no equivalent at all for these three, unlike
-- Instagram/WhatsApp which already drew from them. These are deliberately
-- separate from the _instagram/_whatsapp columns added in migration 0101
-- (Aura's own access is independent of what either public bot shares),
-- same pattern already established for allow_fundraisers/allow_events.
-- Defaults to true, same as every other category — Aura has full access
-- out of the box.
alter table public.ai_data_access_rules
  add column if not exists allow_ministries boolean not null default true,
  add column if not exists allow_branches boolean not null default true,
  add column if not exists allow_forms boolean not null default true;
