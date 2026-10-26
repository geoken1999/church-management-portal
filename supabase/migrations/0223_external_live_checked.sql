-- When the app last asked YouTube whether an announced stream is still live, so many members' phones polling the Live now
-- card cause at most one check a minute for the church.
alter table public.external_live_streams add column if not exists last_checked_at timestamptz;

-- Reversal (run manually if needed):
--   alter table public.external_live_streams drop column if exists last_checked_at;
