-- Per-to-do reminder choices. A daily job (/api/cron/todo-reminders, about 8:45 AM
-- India time) sends them:
--   remind_day_before - a push the day before the due date
--   remind_due_day    - a push on the due date, and while it stays overdue
--                       (on by default, which is how every existing to-do already worked)
alter table public.todos
  add column if not exists remind_day_before boolean not null default false,
  add column if not exists remind_due_day boolean not null default true,
  add column if not exists day_before_sent_at timestamptz;

-- Reversal (run manually if needed):
--   alter table public.todos drop column if exists remind_day_before, drop column if exists remind_due_day, drop column if exists day_before_sent_at;
