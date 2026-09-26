-- Lets an organizer turn on a reminder email for an event's registrants —
-- sent once per occurrence, at a choice of three offsets. Nullable/no
-- default: existing events get no reminder until an organizer opts in.
alter table public.events
  add column if not exists reminder_offset text check (reminder_offset in ('24h', '1h', 'morning_of'));

-- Per-registration idempotency: a cron (src/app/api/cron/event-reminders)
-- runs every 15 minutes and re-evaluates every event with a reminder
-- configured, so it needs to know which occurrence a registration was
-- already reminded for — a plain "already sent" boolean would only ever
-- fire once, but a recurring event's registrants should get a fresh
-- reminder before EACH occurrence, not just the first one the cron
-- happens to catch.
alter table public.event_registrations
  add column if not exists last_reminder_occurrence_date date,
  add column if not exists last_reminder_sent_at timestamptz;
