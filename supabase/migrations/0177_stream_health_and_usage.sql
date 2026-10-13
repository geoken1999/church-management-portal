-- Live stream health and what each session uses.
-- Viewers report how their playback is going (ping, buffer, stalls) and how long they watch,
-- so the stream page can show health and Super Admin can see the resources a session used.
alter table public.live_stream_viewers
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists watch_seconds integer not null default 0,
  add column if not exists rtt_ms integer,
  add column if not exists buffered_ms integer,
  add column if not exists stalls integer not null default 0,
  add column if not exists buffering boolean not null default false,
  add column if not exists resolution text;

-- Time people spent in a call or broadcast room (from the video service), filled in by Super Admin.
alter table public.kmeet_meetings
  add column if not exists participant_seconds integer,
  add column if not exists usage_checked_at timestamptz;

-- Reversal (run manually if needed):
--   alter table public.live_stream_viewers drop column if exists first_seen_at, drop column if exists watch_seconds, drop column if exists rtt_ms, drop column if exists buffered_ms, drop column if exists stalls, drop column if exists buffering, drop column if exists resolution;
--   alter table public.kmeet_meetings drop column if exists participant_seconds, drop column if exists usage_checked_at;
