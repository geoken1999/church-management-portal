-- One-time setup: makes Supabase call the app every 5 minutes so scheduled campaigns go out.
-- This works on any Vercel plan (Vercel's free plan can only run a job once a day).
--
-- Before running it, in the Supabase SQL editor:
--   1. Replace YOUR_SITE with the exact address of your live site, with the www: https://www.kingdomflow.in
--      (without www the site answers with a redirect, which this job does not follow, so nothing would send)
--   2. Replace YOUR_CRON_SECRET with the value of CRON_SECRET from your Vercel environment variables.
-- Keep this file's edited copy out of git: it holds a secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- If it was set up before, replace it.
select cron.unschedule('send-scheduled-campaigns')
where exists (select 1 from cron.job where jobname = 'send-scheduled-campaigns');

select cron.schedule(
  'send-scheduled-campaigns',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'YOUR_SITE/api/cron/scheduled-campaigns',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- To check it is running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:               select cron.unschedule('send-scheduled-campaigns');
