-- Two more push categories (default on, like the others):
--   team_alert   - alerts to church staff: a new membership request, a new
--                  event registration, a profile change to review, ...
--   event_update - a change to or cancellation of an event the person is
--                  registered for.
alter table public.notification_preferences
  add column if not exists team_alert boolean not null default true,
  add column if not exists event_update boolean not null default true;

-- Reversal (run manually if needed):
--   alter table public.notification_preferences drop column if exists team_alert, drop column if exists event_update;
