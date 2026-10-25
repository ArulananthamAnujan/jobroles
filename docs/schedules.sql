-- Schedules for the JobRoles background workers, using pg_cron and pg_net inside Supabase.
-- Run this once in the Supabase SQL editor of the PRODUCTION project, after the Edge Functions are deployed and
-- their secrets are set (docs/EMAIL-SETUP.md). It is not a migration on purpose: it needs values only you have.
--
-- 1. In Database > Extensions, turn on pg_cron and pg_net (and Vault if it is not already on).
-- 2. Replace the six placeholder values in step A, run the whole file, then delete the values from the editor.
--    The secrets are kept encrypted in Supabase Vault; the schedules read them from there at run time.

-- A. Store the values the schedules need. Use the SAME worker secrets you set with `supabase secrets set`.
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co','jobroles_project_url');
select vault.create_secret('YOUR-ANON-KEY','jobroles_anon_key');                       -- Settings > API > anon public key
select vault.create_secret('SAME-AS-NOTIFICATION_WORKER_SECRET','jobroles_notification_secret');
select vault.create_secret('SAME-AS-JOB_ALERT_WORKER_SECRET','jobroles_job_alert_secret');
select vault.create_secret('SAME-AS-JOB_FEED_WORKER_SECRET','jobroles_job_feed_secret');
select vault.create_secret('SAME-AS-RESUME_SCAN_WORKER_SECRET','jobroles_resume_scan_secret');

-- B. One helper that calls a worker with the gateway token and its own secret header.
create or replace function private.call_worker(fn text,header text,secret_name text) returns bigint language sql security definer set search_path='' as $$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='jobroles_project_url')||'/functions/v1/'||fn,
  headers:=jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='jobroles_anon_key'),
   header,(select decrypted_secret from vault.decrypted_secrets where name=secret_name)),
  body:='{}'::jsonb,timeout_milliseconds:=55000)
$$;
revoke all on function private.call_worker(text,text,text) from public,anon,authenticated;

-- C. The schedules. Re-running this file replaces them.
select cron.schedule('jobroles-notification-mail','* * * * *',$$select private.call_worker('notification-mail','x-notification-worker-secret','jobroles_notification_secret')$$);
select cron.schedule('jobroles-job-alerts','*/15 * * * *',$$select private.call_worker('job-alerts','x-job-alert-secret','jobroles_job_alert_secret')$$);
select cron.schedule('jobroles-job-feed-import','*/30 * * * *',$$select private.call_worker('job-feed-import','x-job-feed-secret','jobroles_job_feed_secret')$$);
-- Only once a resume scanner is set up (RESUME_SCANNER_URL); until then leave this line out.
-- select cron.schedule('jobroles-resume-scan','*/5 * * * *',$$select private.call_worker('resume-scan','x-resume-scan-secret','jobroles_resume_scan_secret')$$);

-- D. Checking that they run: each call's HTTP status appears here within a minute or two.
--    200 means it worked; 401 means a secret does not match; 503 means a function secret is missing.
-- select id,status_code,left(content::text,200) from net._http_response order by id desc limit 20;
-- select jobname,status,return_message,start_time from cron.job_run_details order by start_time desc limit 20;
--
-- To stop one: select cron.unschedule('jobroles-job-alerts');
