-- Recurring scheduled notifications: a scheduled message can repeat every day, week or month, optionally until a date.
-- After each send the runner moves scheduled_at to the next time instead of finishing the row.
alter table public.scheduled_campaigns add column if not exists repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly'));
alter table public.scheduled_campaigns add column if not exists repeat_until timestamptz;
