-- Tapping a notification in the app opens the screen it is about. A saved notification now remembers what it
-- is about (the type and the ids that came with the push), so the notification center can open the same
-- screen as tapping the push itself does.
alter table public.member_notifications add column if not exists data jsonb;

-- Reversal (run manually if needed):
--   alter table public.member_notifications drop column if exists data;
