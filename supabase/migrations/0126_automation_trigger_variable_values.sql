-- Per-trigger choice of what fills each of the selected template's
-- placeholders: { "<variable name>": "field:<member field>" | "text:<literal>" }.
-- A variable with no entry falls back to the built-in field of the same
-- name (first_name, church_name, ...), so triggers saved before this
-- column existed keep sending exactly what they did.
alter table public.automation_triggers
  add column if not exists variable_values jsonb not null default '{}'::jsonb;

-- Reversal (run manually if needed):
--   alter table public.automation_triggers drop column if exists variable_values;
