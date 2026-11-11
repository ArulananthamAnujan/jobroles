-- What the administrator's "Setup status" screen needs to know from inside the database: which worker schedules
-- exist, whether emails and imports are actually moving, and a marker for the newest database update applied.
begin;
create function public.jp_setup_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare jobs jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 -- pg_cron is optional; without it there are no schedules to list.
 if to_regclass('cron.job') is not null then
  begin execute $q$select coalesce(jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active)),'[]'::jsonb) from cron.job where jobname like 'jobroles-%'$q$ into jobs;
  exception when others then jobs:='[]'::jsonb;end;
 end if;
 return jsonb_build_object(
  'version','20261111000002',
  'cron',to_regclass('cron.job') is not null,
  'schedules',jobs,
  'mail',(select jsonb_build_object('pending',count(*) filter(where state='pending'),'accepted',count(*) filter(where state='accepted'),'failed',count(*) filter(where state='failed'),
    'oldestPending',min(created_at) filter(where state='pending'),'latest',max(created_at)) from private.notification_deliveries),
  'feeds',(select jsonb_build_object('active',count(*) filter(where active),'neverRun',count(*) filter(where active and last_run_at is null and created_at<now()-interval '2 hours'),
    'stale',count(*) filter(where active and last_run_at<now()-interval '6 hours'),'failed',count(*) filter(where active and last_status='failed'),'lastRun',max(last_run_at)) from public.job_feeds),
  'alerts',(select count(*) from public.saved_searches where frequency<>'off'),
  'scansWaiting',(select count(*) from public.resume_versions where scan_status='pending' and deleted_at is null),
  'buckets',(select coalesce(jsonb_agg(id),'[]'::jsonb) from storage.buckets where id in ('resumes','company-media')),
  'directResumeRead',exists(select 1 from pg_catalog.pg_policies where schemaname='storage' and tablename='objects' and policyname='resume_read_authorised'),
  'deletionRequests',(select count(*) from public.privacy_requests where kind='deletion' and status in ('requested','reviewing')));
end $$;
revoke all on function public.jp_setup_status() from public,anon;
grant execute on function public.jp_setup_status() to authenticated;
commit;
