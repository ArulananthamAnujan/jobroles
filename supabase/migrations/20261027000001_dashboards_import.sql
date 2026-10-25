-- Data for the redesigned dashboards, and bulk import of jobs from a spreadsheet.
begin;

-- Employer: who is waiting on us, how each job's pipeline looks, and the response record job seekers see.
create function public.jp_hiring_overview(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Australia/Sydney')::date;
begin
 if not exists(select 1 from public.company_memberships where company_id=company and user_id=auth.uid() and revoked_at is null) then raise exception 'Company access denied' using errcode='42501';end if;
 return (with jobs as (select j.* from public.jobs j where j.company_id=company and private.job_permission(j.id,'read')),
  apps as (select a.*,s.profile->>'full_name' as full_name from public.applications a join jobs j on j.id=a.job_id left join public.application_snapshots s on s.application_id=a.id where a.state<>'draft'),
  first_action as (select a.id,a.submitted_at,(select min(h.created_at) from public.application_stage_history h where h.application_id=a.id and h.actor_id<>a.seeker_id) as acted from apps a where a.submitted_at>now()-interval '180 days')
 select jsonb_build_object(
  'pipeline',coalesce((select jsonb_agg(x order by x->>'publishedAt' desc) from (select jsonb_build_object('jobId',j.id,'title',j.title,'location',(select string_agg(l.label,' · ') from public.job_locations l where l.job_id=j.id),
    'publishedAt',j.published_at,'expiresAt',j.expires_at,
    'new',count(a.id) filter(where a.state='submitted' and a.stage='new'),'reviewed',count(a.id) filter(where a.state='submitted' and a.stage='reviewed'),
    'shortlisted',count(a.id) filter(where a.state='submitted' and a.stage='shortlisted'),'interview',count(a.id) filter(where a.state='submitted' and a.stage='interview'),
    'offer',count(a.id) filter(where a.state='submitted' and a.stage in ('offer','hired')),'total',count(a.id) filter(where a.state='submitted'),
    'oldestNewDays',coalesce(max(extract(day from now()-a.submitted_at)::int) filter(where a.state='submitted' and a.stage='new'),0),
    'views7',(select coalesce(sum(v.views),0) from public.job_view_counts v where v.job_id=j.id and v.day>current_date-7)) x
   from jobs j left join apps a on a.job_id=j.id where j.state='live' and j.expires_at>now() group by j.id,j.title,j.published_at,j.expires_at) p),'[]'::jsonb),
  'daily',(select jsonb_agg(jsonb_build_object('day',d::date,'count',(select count(*) from apps a where (a.submitted_at at time zone 'Australia/Sydney')::date=d::date)) order by d) from generate_series(today-29,today,interval '1 day') d),
  'waiting',coalesce((select jsonb_agg(x) from (select jsonb_build_object('applicationId',a.id,'name',coalesce(a.full_name,'Applicant'),'jobTitle',j.title,'submittedAt',a.submitted_at,'days',extract(day from now()-a.submitted_at)::int) x
   from apps a join jobs j on j.id=a.job_id where a.state='submitted' and a.stage='new' order by a.submitted_at limit 6) w),'[]'::jsonb),
  'waitingTotal',(select count(*) from apps where state='submitted' and stage='new'),
  'waitingOver3',(select count(*) from apps where state='submitted' and stage='new' and submitted_at<now()-interval '3 days'),
  'response',(select jsonb_build_object('applications',count(*),'responded',count(acted),'respondedShare',case when count(*)=0 then null else round(100.0*count(acted)/count(*)) end,
    'medianDays',round((percentile_cont(.5) within group (order by extract(epoch from acted-submitted_at)/86400) filter (where acted is not null))::numeric,1),'public',count(*)>=5) from first_action)));
end $$;

-- Job seeker: every application with where it stands, what the employer did last, and what to do next.
create function public.jp_seeker_home() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'applications',coalesce((select jsonb_agg(x order by x->>'updatedAt' desc) from (select jsonb_build_object('id',a.id,'jobId',j.id,'title',j.title,'company',c.name,'companyId',c.id,'state',a.state,'stage',a.stage,
    'submittedAt',a.submitted_at,'updatedAt',greatest(a.submitted_at,(select max(h.created_at) from public.application_stage_history h where h.application_id=a.id),(select max(m.created_at) from public.application_messages m where m.application_id=a.id)),
    'unread',(select count(*) from public.application_messages m where m.application_id=a.id and m.sender_id<>a.seeker_id and m.created_at>coalesce((select max(m2.created_at) from public.application_messages m2 where m2.application_id=a.id and m2.sender_id=a.seeker_id),'-infinity'::timestamptz)),
    'interview',(select jsonb_build_object('id',i.id,'startsAt',i.starts_at,'timeZone',i.time_zone,'format',i.format) from public.interviews i where i.application_id=a.id and i.cancelled_at is null and i.starts_at>now()-interval '2 hours' order by i.starts_at limit 1),
    'proposal',exists(select 1 from public.interview_proposals p where p.application_id=a.id and p.chosen is null and p.cancelled_at is null),
    'responseShare',(select (public.jp_company_responsiveness(c.id))->>'respondedShare')) x
   from public.applications a join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id where a.seeker_id=auth.uid() and a.state<>'draft') s),'[]'::jsonb),
  'drafts',(select count(*) from public.applications where seeker_id=auth.uid() and state='draft'),
  'saved',(select count(*) from public.saved_jobs where user_id=auth.uid()),
  'alerts',(select count(*) from public.saved_searches where user_id=auth.uid() and frequency<>'off'),
  'invites',(select count(*) from public.candidate_invites where seeker_id=auth.uid() and dismissed_at is null),
  'profile',(select jsonb_build_object('name',p.full_name,'headline',p.headline<>'','location',p.location<>'','skills',cardinality(p.skills)>0,'experience',jsonb_array_length(p.experience)>0,'searchable',p.searchable,
    'resume',exists(select 1 from public.resume_versions r where r.user_id=auth.uid() and r.deleted_at is null),'assessment',exists(select 1 from public.assessment_attempts t where t.user_id=auth.uid() and t.completed_at is not null)) from public.seeker_profiles p where p.user_id=auth.uid()))
$$;

-- Platform admin: every queue with its size and how long the oldest item has waited, and two weeks of activity.
create function public.jp_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare today date:=(now() at time zone 'Australia/Sydney')::date;
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return jsonb_build_object(
  'queues',jsonb_build_array(
   (select jsonb_build_object('id','jobs','count',count(*),'oldest',min(created_at)) from public.jobs where state='pending_review'),
   (select jsonb_build_object('id','companies','count',count(*),'oldest',min(created_at)) from public.companies where verified_at is null and suspended_at is null),
   (select jsonb_build_object('id','reports','count',count(*),'oldest',min(created_at)) from public.job_reports where state='open'),
   (select jsonb_build_object('id','reviews','count',count(*),'oldest',min(created_at)) from public.company_reviews where status='pending'),
   (select jsonb_build_object('id','community','count',(select count(*) from public.company_interviews where status='pending')+(select count(*) from public.company_questions where status='pending')+(select count(*) from public.company_answers where status='pending'),
     'oldest',least((select min(created_at) from public.company_interviews where status='pending'),(select min(created_at) from public.company_questions where status='pending'),(select min(created_at) from public.company_answers where status='pending')))),
   (select jsonb_build_object('id','flagged','count',count(distinct (kind,target_id)),'oldest',min(created_at)) from public.content_reports where resolved_at is null),
   (select jsonb_build_object('id','support','count',count(*),'oldest',min(created_at)) from public.support_tickets where status='open')),
  'totals',jsonb_build_object('liveJobs',(select count(*) from public.jobs where state='live' and expires_at>now()),'employers',(select count(*) from public.companies where verified_at is not null),
   'seekers',(select count(*) from public.seeker_profiles),'applications7',(select count(*) from public.applications where state<>'draft' and submitted_at>now()-interval '7 days')),
  'daily',(select jsonb_agg(jsonb_build_object('day',d::date,'applications',(select count(*) from public.applications a where a.state<>'draft' and (a.submitted_at at time zone 'Australia/Sydney')::date=d::date),
   'jobs',(select count(*) from public.jobs j where (j.published_at at time zone 'Australia/Sydney')::date=d::date)) order by d) from generate_series(today-13,today,interval '1 day') d));
end $$;

-- Bulk import: create up to 200 jobs from spreadsheet rows. Each row is saved on its own, so one bad row never
-- blocks the rest, and the result says which rows were saved and why the others were not.
create function public.jp_bulk_import_jobs(company uuid,rows jsonb,submit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; i integer:=0; saved jsonb; results jsonb:='[]'::jsonb; ok integer:=0; locations jsonb;
begin
 if not exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter')) then raise exception 'Owners and recruiters can import jobs' using errcode='42501';end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'Import between 1 and 200 jobs at a time' using errcode='22023';end if;
 for r in select * from jsonb_array_elements(rows) loop
  i:=i+1;
  begin
   locations:=coalesce((select jsonb_agg(trim(x)) from jsonb_array_elements_text(coalesce(r->'locations','[]')) x where trim(x)<>''),'[]');
   saved:=private.jp_command('job.save',jsonb_build_object('companyId',company,'title',left(trim(r->>'title'),160),'description',r->>'description','locations',locations,
    'type',r->>'type','arrangement',r->>'arrangement','min',r->>'min','max',r->>'max','period',coalesce(nullif(r->>'period',''),'year'),'sponsorship',coalesce((r->>'sponsorship')::boolean,false),'submit',submit,
    'screening',nullif(trim(coalesce(r->>'screening','')),'')));
   if coalesce(jsonb_array_length(r->'benefits'),0)>0 or nullif(r->>'startDate','') is not null or nullif(r->>'externalApplyUrl','') is not null then
    perform public.jp_job_extras((saved->>'id')::uuid,jsonb_build_object('benefits',coalesce(r->'benefits','[]'),'startDate',coalesce(r->>'startDate',''),'externalApplyUrl',coalesce(r->>'externalApplyUrl','')));
   end if;
   results:=results||jsonb_build_object('row',i,'ok',true,'id',saved->>'id','state',saved->>'state');ok:=ok+1;
  exception when others then
   results:=results||jsonb_build_object('row',i,'ok',false,'error',case when sqlstate in ('22023','42501','23514','22P02','23502') then sqlerrm else 'This row could not be saved' end);
  end;
 end loop;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'jobs.import','company',company,format('%s of %s rows',ok,i));
 return jsonb_build_object('saved',ok,'failed',i-ok,'results',results);
end $$;

revoke all on function public.jp_hiring_overview(uuid),public.jp_seeker_home(),public.jp_admin_overview(),public.jp_bulk_import_jobs(uuid,jsonb,boolean) from public,anon;
grant execute on function public.jp_hiring_overview(uuid),public.jp_seeker_home(),public.jp_admin_overview(),public.jp_bulk_import_jobs(uuid,jsonb,boolean) to authenticated;
commit;
