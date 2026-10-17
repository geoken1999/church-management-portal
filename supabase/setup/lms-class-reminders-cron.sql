-- One-time setup: makes Supabase call the app every 5 minutes so Bible School students get a
-- "your class starts soon" notification about 10 minutes before a live class. This works on any
-- Vercel plan, like the scheduled campaigns job (supabase/setup/scheduled-campaigns-cron.sql).
--
-- Before running it, in the Supabase SQL editor:
--   1. Replace YOUR_SITE with the exact address of your live site, with the www: https://www.kingdomflow.in
--   2. Replace YOUR_CRON_SECRET with the value of CRON_SECRET from your Vercel environment variables.
-- Keep this file's edited copy out of git: it holds a secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('lms-class-reminders')
where exists (select 1 from cron.job where jobname = 'lms-class-reminders');

select cron.schedule(
  'lms-class-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'YOUR_SITE/api/cron/lms-class-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- To check it is running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:               select cron.unschedule('lms-class-reminders');
