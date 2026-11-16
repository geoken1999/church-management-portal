-- The Sunday-morning WhatsApp summary of the week's special days.
--
-- It rides on the existing staff digest destination (same leaders, same daily run), so a church that already sends the day-before / daily digest
-- gets two more settings on that destination:
--   weekly_enabled      send, every Sunday morning (in the church's timezone), one message listing every special day (birthdays, anniversaries and any
--                       other date fields the automation's triggers use) in the seven days from that Sunday to Saturday. Nothing is sent for a week with none.
--   weekly_template_id  the approved WhatsApp template used for it. A proactive WhatsApp message must use a template Meta has approved, and the weekly
--                       wording is different from the daily one, so it has its own: a staff_digest template whose only variable is {{celebrant_list}}
--                       (enforced in TS, like the daily one).
-- The daily digest keeps working exactly as before whether or not the weekly one is on, and the weekly one works even if the daily one is switched
-- off (is_active only controls the daily digest). Once per Sunday per automation is guaranteed by automation_executions' unique idempotency key
-- ('weekly:<automation>:<date>').

alter table public.automation_destinations
  add column if not exists weekly_enabled boolean not null default false,
  add column if not exists weekly_template_id uuid references public.automation_templates (id) on delete set null;

-- Reversal (run manually if needed):
--   alter table public.automation_destinations drop column if exists weekly_template_id, drop column if exists weekly_enabled;
