-- K-meet additions: waiting-room admission control, and a per-plan call
-- duration limit locked in the moment a meeting's VideoSDK room is
-- actually created (so upgrading plans mid-call doesn't retroactively
-- change a countdown already shown to participants).
alter table public.kmeet_meetings
  add column if not exists require_admission boolean not null default false,
  add column if not exists started_at timestamptz,
  add column if not exists max_duration_minutes integer;
