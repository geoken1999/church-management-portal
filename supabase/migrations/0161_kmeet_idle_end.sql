-- A K-Connect call nobody is in for 3 minutes is ended automatically.
--
-- Everyone connected to a call (web or the mobile app) reports in every 30
-- seconds, which keeps last_active_at fresh. A live call whose last_active_at is
-- more than 3 minutes old has had no one in it, so it is ended. The server also
-- applies the same rule whenever someone tries to join or lists calls, so the
-- rule holds even without the scheduled job below.
alter table public.kmeet_meetings
  add column if not exists last_active_at timestamptz not null default now();

create index if not exists kmeet_meetings_live_idx on public.kmeet_meetings (last_active_at) where status = 'live';

create or replace function public.end_idle_kmeet_meetings()
returns integer
language sql
security definer
set search_path = public
as $$
  with ended as (
    update public.kmeet_meetings
       set status = 'ended', ended_at = now()
     where status = 'live' and last_active_at < now() - interval '3 minutes'
    returning 1
  )
  select count(*)::integer from ended;
$$;

revoke all on function public.end_idle_kmeet_meetings() from public, anon, authenticated;

-- Runs every minute when the pg_cron extension is available (Supabase: Database ->
-- Extensions -> pg_cron). Without it nothing breaks: the server ends idle calls
-- itself when they are next opened or listed.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('end-idle-kmeet-meetings', '* * * * *', 'select public.end_idle_kmeet_meetings()');
exception when others then
  raise notice 'pg_cron is not available (%); idle calls are ended by the server instead.', sqlerrm;
end $$;

-- Reversal (run manually if needed):
--   select cron.unschedule('end-idle-kmeet-meetings');
--   drop function if exists public.end_idle_kmeet_meetings();
--   alter table public.kmeet_meetings drop column if exists last_active_at;
