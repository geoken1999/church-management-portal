-- When members were told, by push notification, that a Zoom or Google Meet meeting has started. Set once, so the
-- push goes out the first time the meeting starts and not again.
alter table public.conference_meetings add column if not exists notified_at timestamptz;
