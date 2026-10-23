-- Employer portal: company profiles and media, richer jobs, pipeline and bulk actions, inbox and templates,
-- interview proposals, notification preferences and digests, invoices, team, dashboard, company follows,
-- directory, and richer reviews.
begin;

-- Company profile ------------------------------------------------------------------------------------------
alter table public.companies add column logo_url text,add column cover_url text,add column website text check(website is null or (website ~ '^https://' and length(website)<=300)),
 add column industry text check(industry is null or length(industry)<=80),add column size_band text check(size_band is null or size_band in ('1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+')),
 add column headquarters text check(headquarters is null or length(headquarters)<=120),add column founded_year integer check(founded_year is null or founded_year between 1788 and 2100),
 add column pitch text check(pitch is null or length(pitch)<=2000),add column benefits text[] not null default '{}',add column photos text[] not null default '{}';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('company-media','company-media',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy company_media_owner_write on storage.objects for insert to authenticated with check(bucket_id='company-media' and private.owner_permission(((storage.foldername(name))[1])::uuid));
create policy company_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='company-media' and private.owner_permission(((storage.foldername(name))[1])::uuid));
create function private.media_url_ok(company uuid,url text) returns boolean language sql immutable set search_path='' as $$
 select url is null or (url ~ '^https://' and position('/storage/v1/object/public/company-media/'||company::text||'/' in url)>0 and length(url)<=500)
$$;
create function public.jp_company_profile(company uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b text[]:=array(select left(trim(x),80) from jsonb_array_elements_text(coalesce(payload->'benefits','[]')) x where trim(x)<>'' limit 20);
 p text[]:=array(select x from jsonb_array_elements_text(coalesce(payload->'photos','[]')) x limit 12);
begin
 if not private.owner_permission(company) then raise exception 'Company owner required' using errcode='42501';end if;
 if not private.media_url_ok(company,nullif(payload->>'logoUrl','')) or not private.media_url_ok(company,nullif(payload->>'coverUrl','')) or exists(select 1 from unnest(p) x where not private.media_url_ok(company,x)) then raise exception 'Images must be uploaded through JobRoles' using errcode='22023';end if;
 update public.companies set about=left(coalesce(payload->>'about',about),5000),logo_url=nullif(payload->>'logoUrl',''),cover_url=nullif(payload->>'coverUrl',''),website=nullif(trim(payload->>'website'),''),
  industry=nullif(left(trim(coalesce(payload->>'industry','')),80),''),size_band=nullif(payload->>'sizeBand',''),headquarters=nullif(left(trim(coalesce(payload->>'headquarters','')),120),''),
  founded_year=nullif(payload->>'foundedYear','')::integer,pitch=nullif(left(trim(coalesce(payload->>'pitch','')),2000),''),benefits=b,photos=p where id=company;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'company.profile','company',company,'Profile updated');
 return jsonb_build_object('ok',true);
end $$;

-- Jobs: screening questions, benefits, start date, external apply ---------------------------------------------
alter table public.jobs add column benefits text[] not null default '{}',add column start_date date,add column external_apply_url text check(external_apply_url is null or (external_apply_url ~ '^https://' and length(external_apply_url)<=500));
create function public.jp_set_screening(target uuid,questions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; n integer:=0;
begin
 if not private.job_permission(target,'edit') then raise exception 'Job access denied' using errcode='42501';end if;
 if exists(select 1 from public.applications where job_id=target and state<>'draft') then raise exception 'Screening questions are fixed once people have applied' using errcode='22023';end if;
 if jsonb_typeof(questions)<>'array' or jsonb_array_length(questions) not between 1 and 10 then raise exception 'Add between 1 and 10 questions' using errcode='22023';end if;
 for q in select * from jsonb_array_elements(questions) loop
  if length(trim(coalesce(q->>'question',''))) not between 5 and 300 or coalesce(q->>'expected','Yes') not in ('Yes','No') then raise exception 'Each question needs 5 to 300 characters' using errcode='22023';end if;
 end loop;
 delete from public.screening_questions where job_id=target;
 for q in select * from jsonb_array_elements(questions) loop
  insert into public.screening_questions(job_id,question,required,must_have,expected_answer,position) values(target,trim(q->>'question'),true,coalesce((q->>'mustHave')::boolean,false),coalesce(q->>'expected','Yes'),n);n:=n+1;
 end loop;
 return jsonb_build_object('count',n);
end $$;
create function public.jp_job_extras(target uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; b text[]:=array(select left(trim(x),80) from jsonb_array_elements_text(coalesce(payload->'benefits','[]')) x where trim(x)<>'' limit 20); url text:=nullif(trim(coalesce(payload->>'externalApplyUrl','')),'');
begin
 select * into j from public.jobs where id=target for update;
 if not found or not private.job_permission(target,'edit') then raise exception 'Job access denied' using errcode='42501';end if;
 if url is not null and (url !~ '^https://' or length(url)>500) then raise exception 'The application link must start with https://' using errcode='22023';end if;
 -- A changed apply link on a live role goes back to review, like any other edit.
 update public.jobs set benefits=b,start_date=nullif(payload->>'startDate','')::date,external_apply_url=url,
  state=case when j.state='live' and url is distinct from j.external_apply_url then 'pending_review'::public.job_state else j.state end where id=target;
 return jsonb_build_object('ok',true);
end $$;

-- Pipeline, bulk actions, templates ----------------------------------------------------------------------------
create table public.application_reads(user_id uuid not null references auth.users(id) on delete cascade,application_id uuid not null references public.applications(id),last_read_at timestamptz not null default now(),primary key(user_id,application_id));
alter table public.application_reads enable row level security;revoke all on public.application_reads from anon,authenticated;
create function public.jp_mark_read(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can_read_application(target) then raise exception 'Application access denied' using errcode='42501';end if;
 insert into public.application_reads(user_id,application_id) values(auth.uid(),target) on conflict(user_id,application_id) do update set last_read_at=now();
 return true;
end $$;
create function public.jp_pipeline(target uuid) returns table(application_id uuid,stage text,state text,submitted_at timestamptz,full_name text,headline text,location text,email text,answers jsonb,meets_requirements boolean,unread bigint,resume_version_id uuid,reinstatement_requested boolean)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 if not private.job_permission(target,'read') then raise exception 'Job access denied' using errcode='42501';end if;
 return query select a.id,a.stage::text,a.state::text,a.submitted_at,s.profile->>'full_name',s.profile->>'headline',s.profile->>'location',s.profile->>'email',s.answers,
  not exists(select 1 from public.screening_questions q where q.job_id=a.job_id and q.must_have and coalesce(s.answers->>q.id::text,'')<>q.expected_answer),
  (select count(*) from public.application_messages m where m.application_id=a.id and m.sender_id=a.seeker_id and m.created_at>coalesce((select r.last_read_at from public.application_reads r where r.user_id=auth.uid() and r.application_id=a.id),'-infinity')),
  s.resume_version_id,a.reinstatement_requested_at is not null
 from public.applications a join public.application_snapshots s on s.application_id=a.id where a.job_id=target and a.state<>'draft' order by a.submitted_at desc limit 1000;
end $$;
create function public.jp_bulk_move(ids uuid[],wanted text,note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare x uuid; n integer:=0;
begin
 if cardinality(ids) not between 1 and 200 then raise exception 'Choose between 1 and 200 applicants' using errcode='22023';end if;
 if wanted not in ('new','reviewed','shortlisted','interview','offer','hired','rejected') then raise exception 'Unknown stage' using errcode='22023';end if;
 foreach x in array ids loop
  perform private.jp_command('application.move',jsonb_build_object('id',x,'stage',wanted));
  if length(trim(coalesce(note,'')))>0 then perform private.jp_command('message.send',jsonb_build_object('id',x,'body',left(trim(note),5000)));end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('moved',n);
end $$;
create table public.message_templates(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),name text not null check(length(name) between 2 and 80),body text not null check(length(body) between 10 and 5000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table public.message_templates enable row level security;revoke all on public.message_templates from anon,authenticated;grant select on public.message_templates to authenticated;
create policy templates_team on public.message_templates for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=message_templates.company_id and m.user_id=(select auth.uid()) and m.revoked_at is null));
create function public.jp_template(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.message_templates%rowtype; target uuid;
begin
 if action='save' then
  target:=(payload->>'companyId')::uuid;
  if not exists(select 1 from public.company_memberships where company_id=target and user_id=auth.uid() and revoked_at is null and role in ('owner','recruiter')) then raise exception 'Owner or recruiter required' using errcode='42501';end if;
  if (select count(*) from public.message_templates where company_id=target)>=50 then raise exception 'Up to 50 templates' using errcode='22023';end if;
  insert into public.message_templates(company_id,name,body,created_by) values(target,trim(payload->>'name'),trim(payload->>'body'),auth.uid()) returning id into target;
  return jsonb_build_object('id',target);
 elsif action='delete' then
  select * into t from public.message_templates where id=(payload->>'id')::uuid;
  if not found or not exists(select 1 from public.company_memberships where company_id=t.company_id and user_id=auth.uid() and revoked_at is null and role in ('owner','recruiter')) then raise exception 'Template access denied' using errcode='42501';end if;
  delete from public.message_templates where id=t.id;return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown template action' using errcode='22023';
end $$;
create function public.jp_inbox(company uuid) returns table(application_id uuid,job_title text,full_name text,last_body text,last_at timestamptz,last_from_candidate boolean,unread bigint)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 if not exists(select 1 from public.company_memberships where company_id=company and user_id=auth.uid() and revoked_at is null) then raise exception 'Company access denied' using errcode='42501';end if;
 return query select a.id,j.title,s.profile->>'full_name',left(m.body,200),m.created_at,m.sender_id=a.seeker_id,
  (select count(*) from public.application_messages x where x.application_id=a.id and x.sender_id=a.seeker_id and x.created_at>coalesce((select r.last_read_at from public.application_reads r where r.user_id=auth.uid() and r.application_id=a.id),'-infinity'))
 from public.applications a join public.jobs j on j.id=a.job_id join public.application_snapshots s on s.application_id=a.id
 join lateral (select body,created_at,sender_id from public.application_messages where application_id=a.id order by created_at desc limit 1) m on true
 where j.company_id=company and a.state<>'draft' and private.job_permission(j.id,'read') order by m.created_at desc limit 200;
end $$;

-- Interview proposals and calendar -----------------------------------------------------------------------------
create table public.interview_proposals(id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id),slots timestamptz[] not null check(cardinality(slots) between 1 and 5),
 time_zone text not null,format text not null check(length(format) between 3 and 500),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),chosen timestamptz,chosen_at timestamptz,cancelled_at timestamptz);
alter table public.interview_proposals enable row level security;revoke all on public.interview_proposals from anon,authenticated;grant select on public.interview_proposals to authenticated;
create policy proposals_read on public.interview_proposals for select to authenticated using(private.can_read_application(application_id));
create function public.jp_propose_interview(target uuid,options timestamptz[],zone text,details text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.applications%rowtype; id uuid;
begin
 select * into a from public.applications where applications.id=target;
 if not found or a.state<>'submitted' or not private.job_permission(a.job_id,'move') then raise exception 'Interview access denied' using errcode='42501';end if;
 if cardinality(options) not between 1 and 5 or exists(select 1 from unnest(options) o where o<=now()) or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Offer 1 to 5 future times and a valid time zone' using errcode='22023';end if;
 update public.interview_proposals set cancelled_at=now() where application_id=target and chosen is null and cancelled_at is null;
 insert into public.interview_proposals(application_id,slots,time_zone,format,created_by) values(target,options,zone,left(trim(details),500),auth.uid()) returning interview_proposals.id into id;
 insert into public.application_messages(application_id,sender_id,body) values(target,auth.uid(),'We would like to interview you. Please choose one of the times offered in your application.');
 insert into private.outbox(event_type,entity_id) values('message.send',target);
 return jsonb_build_object('id',id);
end $$;
create function public.jp_choose_slot(proposal uuid,slot timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.interview_proposals%rowtype; a public.applications%rowtype;
begin
 select * into p from public.interview_proposals where id=proposal for update;
 select * into a from public.applications where id=p.application_id;
 if not found or a.seeker_id<>auth.uid() or a.state<>'submitted' then raise exception 'Proposal access denied' using errcode='42501';end if;
 if p.chosen is not null or p.cancelled_at is not null or not slot=any(p.slots) or slot<=now() then raise exception 'That time is no longer available' using errcode='22023';end if;
 update public.interview_proposals set chosen=slot,chosen_at=now() where id=p.id;
 update public.interviews set cancelled_at=now() where application_id=a.id and cancelled_at is null;
 insert into public.interviews(application_id,starts_at,time_zone,format,created_by) values(a.id,slot,p.time_zone,p.format,p.created_by);
 if a.stage in ('new','reviewed','shortlisted') then
  update public.applications set stage='interview' where id=a.id;
  insert into public.application_stage_history(application_id,actor_id,from_state,to_state) values(a.id,auth.uid(),a.stage,'interview');
 end if;
 insert into private.outbox(event_type,entity_id) values('application.interview',a.id);
 return jsonb_build_object('startsAt',slot);
end $$;
create function public.jp_interview_calendar(company uuid,from_at timestamptz,to_at timestamptz) returns table(interview_id uuid,application_id uuid,starts_at timestamptz,time_zone text,format text,cancelled boolean,full_name text,job_title text)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 if not exists(select 1 from public.company_memberships where company_id=company and user_id=auth.uid() and revoked_at is null) then raise exception 'Company access denied' using errcode='42501';end if;
 return query select i.id,a.id,i.starts_at,i.time_zone,i.format,i.cancelled_at is not null,s.profile->>'full_name',j.title
 from public.interviews i join public.applications a on a.id=i.application_id join public.jobs j on j.id=a.job_id join public.application_snapshots s on s.application_id=a.id
 where j.company_id=company and i.starts_at between from_at and to_at and private.job_permission(j.id,'read') order by i.starts_at limit 500;
end $$;

-- Notification preferences and daily digest ------------------------------------------------------------------
create table public.notification_prefs(user_id uuid primary key references auth.users(id) on delete cascade,new_applicant boolean not null default true,messages boolean not null default true,stage_changes boolean not null default true,daily_digest boolean not null default false,last_digest_at timestamptz);
alter table public.notification_prefs enable row level security;revoke all on public.notification_prefs from anon,authenticated;
grant select(user_id,new_applicant,messages,stage_changes,daily_digest) on public.notification_prefs to authenticated;
create policy prefs_self on public.notification_prefs for select to authenticated using(user_id=(select auth.uid()));
create function public.jp_set_notification_prefs(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 insert into public.notification_prefs(user_id,new_applicant,messages,stage_changes,daily_digest) values(auth.uid(),coalesce((payload->>'newApplicant')::boolean,true),coalesce((payload->>'messages')::boolean,true),coalesce((payload->>'stageChanges')::boolean,true),coalesce((payload->>'dailyDigest')::boolean,false))
 on conflict(user_id) do update set new_applicant=excluded.new_applicant,messages=excluded.messages,stage_changes=excluded.stage_changes,daily_digest=excluded.daily_digest,last_digest_at=case when excluded.daily_digest and not notification_prefs.daily_digest then now() else notification_prefs.last_digest_at end;
 return jsonb_build_object('ok',true);
end $$;
create or replace function private.queue_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or new.event_type not in ('application.submitted','application.move','application.interview','application.reinstate','application.withdraw','application.request_reinstatement','message.send') then return new;end if;
 insert into private.notification_deliveries(event_id,application_id,recipient_id,recipient_email,event_type)
 select distinct new.id,a.id,u.id,u.email,new.event_type from public.applications a
 join public.jobs j on j.id=a.job_id
 join auth.users u on (u.id=a.seeker_id or exists(select 1 from public.company_memberships m where m.company_id=j.company_id and m.user_id=u.id and m.revoked_at is null and (m.role='owner' or m.role='recruiter' and exists(select 1 from public.job_assignments ja where ja.job_id=j.id and ja.user_id=u.id))))
 where a.id=new.entity_id and a.state<>'draft' and u.id<>actor and u.email_confirmed_at is not null
 and not exists(select 1 from public.company_blocks b where b.seeker_id=a.seeker_id and b.company_id=j.company_id)
 -- Each person's preferences decide which events email them; a daily digest replaces new-applicant emails.
 and not exists(select 1 from public.notification_prefs p where p.user_id=u.id and (
  (new.event_type='application.submitted' and (not p.new_applicant or p.daily_digest)) or (new.event_type='message.send' and not p.messages)
  or (new.event_type not in ('application.submitted','message.send') and not p.stage_changes)))
 on conflict do nothing;
 return new;
end;$$;
create function public.jp_claim_employer_digests() returns table(user_id uuid,email text,since timestamptz,checked_at timestamptz,jobs jsonb) language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
begin
 return query with due as (select p.user_id,coalesce(p.last_digest_at,now()-interval '1 day') as since from public.notification_prefs p where p.daily_digest and (p.last_digest_at is null or p.last_digest_at<now()-interval '23 hours') limit 100 for update skip locked),
 counts as (select d.user_id,d.since,j.id as job_id,j.title,count(*) as n from due d join public.company_memberships m on m.user_id=d.user_id and m.revoked_at is null and m.role in ('owner','recruiter')
  join public.jobs j on j.company_id=m.company_id join public.applications a on a.job_id=j.id and a.state<>'draft' and a.submitted_at>d.since
  where m.role='owner' or exists(select 1 from public.job_assignments ja where ja.job_id=j.id and ja.user_id=d.user_id) group by d.user_id,d.since,j.id,j.title),
 marked as (update public.notification_prefs p set last_digest_at=now() from due where p.user_id=due.user_id returning p.user_id)
 select d.user_id,u.email::text,d.since,now(),coalesce((select jsonb_agg(jsonb_build_object('jobId',c.job_id,'title',c.title,'count',c.n) order by c.n desc) from counts c where c.user_id=d.user_id),'[]')
 from due d join auth.users u on u.id=d.user_id join marked k on k.user_id=d.user_id where u.email_confirmed_at is not null;
end $$;

-- Billing: invoice links on sponsorships ------------------------------------------------------------------------
alter table public.job_sponsorships add column invoice_url text check(invoice_url is null or invoice_url ~ '^https://');
grant select(invoice_url) on public.job_sponsorships to authenticated;
create function public.jp_set_sponsorship_invoice(session text,url text) returns boolean language sql security definer set search_path='' as $$
 update public.job_sponsorships set invoice_url=url where stripe_session_id=session and url ~ '^https://' returning true
$$;

-- Team list and invitations --------------------------------------------------------------------------------------
create function public.jp_team(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships where company_id=company and user_id=auth.uid() and revoked_at is null) then raise exception 'Company access denied' using errcode='42501';end if;
 return jsonb_build_object(
  'members',(select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,'role',m.role,'assignedJobs',(select count(*) from public.job_assignments ja join public.jobs j on j.id=ja.job_id where ja.user_id=m.user_id and j.company_id=company)) order by m.role,u.email),'[]')
   from public.company_memberships m join auth.users u on u.id=m.user_id where m.company_id=company and m.revoked_at is null),
  'invitations',case when private.owner_permission(company) then (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expiresAt',i.expires_at) order by i.expires_at),'[]') from public.company_invitations i where i.company_id=company and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) else '[]'::jsonb end,
  'isOwner',private.owner_permission(company));
end $$;
create function public.jp_revoke_invitation(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare company uuid;
begin
 select company_id into company from public.company_invitations where id=target;
 if company is null or not private.owner_permission(company) then raise exception 'Company owner required' using errcode='42501';end if;
 update public.company_invitations set revoked_at=now() where id=target and accepted_at is null;return true;
end $$;

-- Dashboard ------------------------------------------------------------------------------------------------------
create function public.jp_employer_dashboard(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships where company_id=company and user_id=auth.uid() and revoked_at is null) then raise exception 'Company access denied' using errcode='42501';end if;
 return (with jobs as (select j.* from public.jobs j where j.company_id=company and private.job_permission(j.id,'read')),
  apps as (select a.* from public.applications a join jobs j on j.id=a.job_id where a.state<>'draft')
 select jsonb_build_object(
  'live',(select count(*) from jobs where state='live' and expires_at>now()),'drafts',(select count(*) from jobs where state='draft'),'pending',(select count(*) from jobs where state='pending_review'),'paused',(select count(*) from jobs where state='paused'),
  'newToday',(select count(*) from apps where submitted_at>date_trunc('day',now())),'newWeek',(select count(*) from apps where submitted_at>now()-interval '7 days'),
  'unreviewed',(select count(*) from apps where state='submitted' and stage='new'),
  'interviewsWeek',(select count(*) from public.interviews i join apps a on a.id=i.application_id where i.cancelled_at is null and i.starts_at between now() and now()+interval '7 days'),
  'unread',(select count(*) from public.application_messages m join apps a on a.id=m.application_id where m.sender_id=a.seeker_id and m.created_at>coalesce((select r.last_read_at from public.application_reads r where r.user_id=auth.uid() and r.application_id=a.id),'-infinity')),
  'views7',(select coalesce(sum(v.views),0) from public.job_view_counts v join jobs j on j.id=v.job_id where v.day>current_date-7),
  'expiring',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'expiresAt',expires_at) order by expires_at),'[]') from jobs where state='live' and expires_at between now() and now()+interval '7 days'),
  'awaiting',(select coalesce(jsonb_agg(x),'[]') from (select jsonb_build_object('applicationId',a.id,'jobTitle',j.title,'name',s.profile->>'full_name','submittedAt',a.submitted_at) x from apps a join jobs j on j.id=a.job_id join public.application_snapshots s on s.application_id=a.id where a.state='submitted' and a.stage='new' order by a.submitted_at limit 8) t),
  'upcoming',(select coalesce(jsonb_agg(x),'[]') from (select jsonb_build_object('applicationId',a.id,'name',s.profile->>'full_name','jobTitle',j.title,'startsAt',i.starts_at,'timeZone',i.time_zone) x from public.interviews i join apps a on a.id=i.application_id join jobs j on j.id=a.job_id join public.application_snapshots s on s.application_id=a.id where i.cancelled_at is null and i.starts_at>now() order by i.starts_at limit 6) t)));
end $$;

-- Follow a company (an alert-enabled saved search on its name) and the public directory ------------------------
create function public.jp_follow_company(company uuid,follow boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.companies%rowtype; wanted_filters jsonb; target uuid;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 select * into c from public.companies where id=company and verified_at is not null and suspended_at is null;
 if not found then raise exception 'Company not found' using errcode='22023';end if;
 wanted_filters:=jsonb_build_object('company',c.name);
 if not follow then delete from public.saved_searches where user_id=auth.uid() and saved_searches.filters=jsonb_build_object('company',c.name);return jsonb_build_object('following',false);end if;
 select id into target from public.saved_searches where user_id=auth.uid() and saved_searches.filters=wanted_filters;
 if target is null then
  if (select count(*) from public.saved_searches where user_id=auth.uid())>=20 then raise exception 'You can save or follow up to 20 searches' using errcode='22023';end if;
  insert into public.saved_searches(user_id,filters,frequency,last_alerted_at) values(auth.uid(),wanted_filters,'daily',now()) returning id into target;
 else update public.saved_searches set frequency='daily',last_alerted_at=coalesce(last_alerted_at,now()) where id=target;end if;
 insert into private.alert_tokens(saved_search_id) values(target) on conflict do nothing;
 return jsonb_build_object('following',true);
end $$;
create function public.jp_is_following(company uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.saved_searches s join public.companies c on c.id=company where s.user_id=auth.uid() and s.filters=jsonb_build_object('company',c.name) and s.frequency<>'off')
$$;
create function public.jp_company_directory(q text default null,p_offset integer default 0) returns table(id uuid,name text,logo_url text,industry text,headquarters text,live_jobs bigint,rating numeric,reviews bigint,total_count bigint)
language sql stable security definer set search_path='' as $$
 select c.id,c.name,c.logo_url,c.industry,c.headquarters,
  (select count(*) from public.jobs j where j.company_id=c.id and j.state='live' and j.expires_at>now()),
  (select round(avg(r.rating),1) from public.company_reviews r where r.company_id=c.id and r.status='published'),
  (select count(*) from public.company_reviews r where r.company_id=c.id and r.status='published'),count(*) over()
 from public.companies c where c.verified_at is not null and c.suspended_at is null and not c.is_agency
  and (nullif(trim(q),'') is null or c.name ilike '%'||replace(replace(replace(trim(q),'\','\\'),'%','\%'),'_','\_')||'%' or c.industry ilike '%'||replace(replace(replace(trim(q),'\','\\'),'%','\%'),'_','\_')||'%')
 order by 6 desc,c.name limit 24 offset greatest(coalesce(p_offset,0),0)
$$;

-- Reviews: category ratings, helpful votes, distribution -------------------------------------------------------
alter table public.company_reviews add column rating_communication smallint check(rating_communication between 1 and 5),add column rating_fairness smallint check(rating_fairness between 1 and 5),add column rating_speed smallint check(rating_speed between 1 and 5),add column helpful_count integer not null default 0;
grant select(rating_communication,rating_fairness,rating_speed,helpful_count) on public.company_reviews to anon,authenticated;
create table public.review_helpful(review_id uuid not null references public.company_reviews(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,primary key(review_id,user_id));
alter table public.review_helpful enable row level security;revoke all on public.review_helpful from anon,authenticated;
create function public.jp_mark_helpful(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to vote' using errcode='42501';end if;
 if not exists(select 1 from public.company_reviews where id=target and status='published' and author_id<>auth.uid()) then raise exception 'Review not available' using errcode='22023';end if;
 insert into public.review_helpful(review_id,user_id) values(target,auth.uid()) on conflict do nothing;
 if found then update public.company_reviews set helpful_count=helpful_count+1 where id=target;end if;
 return jsonb_build_object('helpful',(select helpful_count from public.company_reviews where id=target));
end $$;
drop function public.jp_submit_review(uuid,integer,text,text,text);
create function public.jp_submit_review(company uuid,stars integer,headline text,good text,bad text,communication integer default null,fairness integer default null,speed integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where j.company_id=company and a.seeker_id=actor and a.state<>'draft') then raise exception 'Only people who applied to this employer can review its hiring process' using errcode='42501';end if;
 if exists(select 1 from public.company_memberships where company_id=company and user_id=actor) then raise exception 'Employer team members cannot review their own company' using errcode='42501';end if;
 if stars not between 1 and 5 or length(trim(coalesce(headline,''))) not between 3 and 120 or length(trim(coalesce(good,''))) not between 10 and 2000 or length(trim(coalesce(bad,''))) not between 10 and 2000
  or coalesce(communication,3) not between 1 and 5 or coalesce(fairness,3) not between 1 and 5 or coalesce(speed,3) not between 1 and 5 then
  raise exception 'Give 1 to 5 stars, a title, and at least 10 characters for what went well and what could improve' using errcode='22023';end if;
 insert into public.company_reviews(company_id,author_id,rating,title,pros,cons,rating_communication,rating_fairness,rating_speed) values(company,actor,stars,trim(headline),trim(good),trim(bad),communication,fairness,speed)
 on conflict(company_id,author_id) do update set rating=excluded.rating,title=excluded.title,pros=excluded.pros,cons=excluded.cons,rating_communication=excluded.rating_communication,rating_fairness=excluded.rating_fairness,rating_speed=excluded.rating_speed,status='pending',moderation_reason=null,published_at=null,created_at=now()
 returning id into target;
 return jsonb_build_object('id',target,'status','pending');
end $$;
create or replace function public.jp_company_rating(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then null else jsonb_build_object('average',round(avg(rating),1),'count',count(*),
  'distribution',jsonb_build_object('5',count(*) filter(where rating=5),'4',count(*) filter(where rating=4),'3',count(*) filter(where rating=3),'2',count(*) filter(where rating=2),'1',count(*) filter(where rating=1)),
  'communication',round(avg(rating_communication),1),'fairness',round(avg(rating_fairness),1),'speed',round(avg(rating_speed),1)) end
 from public.company_reviews where company_id=company and status='published'
$$;
create or replace function public.jp_company_responsiveness(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with apps as (select a.id,a.submitted_at,a.stage,(select min(h.created_at) from public.application_stage_history h where h.application_id=a.id and h.actor_id<>a.seeker_id) as first_action
  from public.applications a join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id
  where j.company_id=company and c.verified_at is not null and a.state<>'draft' and a.submitted_at>now()-interval '180 days')
 select case when count(*)<5 then null else jsonb_build_object('applications',count(*),'respondedShare',round(100.0*count(first_action)/count(*)),
  'medianDays',round((percentile_cont(.5) within group (order by extract(epoch from first_action-submitted_at)/86400) filter (where first_action is not null))::numeric,1),
  'interviewShare',round(100.0*count(*) filter(where stage in ('interview','offer','hired'))/count(*))) end from apps
$$;

-- Grants --------------------------------------------------------------------------------------------------------
revoke all on function public.jp_company_profile(uuid,jsonb),public.jp_set_screening(uuid,jsonb),public.jp_job_extras(uuid,jsonb),public.jp_mark_read(uuid),public.jp_pipeline(uuid),public.jp_bulk_move(uuid[],text,text),
 public.jp_template(text,jsonb),public.jp_inbox(uuid),public.jp_propose_interview(uuid,timestamptz[],text,text),public.jp_choose_slot(uuid,timestamptz),public.jp_interview_calendar(uuid,timestamptz,timestamptz),
 public.jp_set_notification_prefs(jsonb),public.jp_team(uuid),public.jp_revoke_invitation(uuid),public.jp_employer_dashboard(uuid),public.jp_follow_company(uuid,boolean),public.jp_is_following(uuid),
 public.jp_mark_helpful(uuid),public.jp_submit_review(uuid,integer,text,text,text,integer,integer,integer) from public,anon;
grant execute on function public.jp_company_profile(uuid,jsonb),public.jp_set_screening(uuid,jsonb),public.jp_job_extras(uuid,jsonb),public.jp_mark_read(uuid),public.jp_pipeline(uuid),public.jp_bulk_move(uuid[],text,text),
 public.jp_template(text,jsonb),public.jp_inbox(uuid),public.jp_propose_interview(uuid,timestamptz[],text,text),public.jp_choose_slot(uuid,timestamptz),public.jp_interview_calendar(uuid,timestamptz,timestamptz),
 public.jp_set_notification_prefs(jsonb),public.jp_team(uuid),public.jp_revoke_invitation(uuid),public.jp_employer_dashboard(uuid),public.jp_follow_company(uuid,boolean),public.jp_is_following(uuid),
 public.jp_mark_helpful(uuid),public.jp_submit_review(uuid,integer,text,text,text,integer,integer,integer) to authenticated;
grant execute on function public.jp_company_directory(text,integer) to anon,authenticated;
revoke all on function public.jp_claim_employer_digests(),public.jp_set_sponsorship_invoice(text,text) from public,anon,authenticated;
grant execute on function public.jp_claim_employer_digests(),public.jp_set_sponsorship_invoice(text,text) to service_role;
revoke all on function private.media_url_ok(uuid,text) from public;
commit;
