-- One row per run of a Vercel cron job (see vercel.json), written by
-- withCronLogging (src/lib/cron/run-logger.ts) around every cron route.
-- Vercel's own cron history is only visible in its dashboard; this is what
-- lets the Super Admin "Cron jobs" page show whether today's scheduled run
-- actually happened, what it did, and run a job by hand.
-- status stays 'running' if the function was killed (e.g. timed out)
-- before it could record a result, which is itself a useful signal.
create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  trigger text not null check (trigger in ('schedule', 'manual')),
  triggered_by_email text,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  http_status integer,
  summary jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists cron_job_runs_job_started_idx on public.cron_job_runs (job_key, started_at desc);

-- Spans every organization and is only read from the Super Admin
-- dashboard: no authenticated-role policy, so only the service-role client
-- can touch it (same lockdown as platform_events).
alter table public.cron_job_runs enable row level security;

-- Reversal (run manually if needed):
--   drop table if exists public.cron_job_runs;
