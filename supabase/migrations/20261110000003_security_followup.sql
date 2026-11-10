-- Follow-up to the November 2026 security review: the four behaviours that were left as design questions.
begin;


-- 1. Withdrawing an application ended the hiring team's access to the resume but not to the rest of what was shared.
--    After a withdrawal the team now sees only the person's name, headline and location (enough to recognise a
--    request to be reinstated): no email, screening answers, cover letter, resume or career profile. The applicant
--    still sees their own copy, and reinstating the application restores the team's access.
drop policy snapshots_read on public.application_snapshots;
create policy snapshots_read on public.application_snapshots for select to authenticated using(
 private.can_read_application(application_id)
 and exists(select 1 from public.applications a where a.id=application_id and (a.state<>'withdrawn' or a.seeker_id=(select auth.uid()))));
create or replace function public.jp_pipeline(target uuid) returns table(application_id uuid,stage text,state text,submitted_at timestamptz,full_name text,headline text,location text,email text,answers jsonb,meets_requirements boolean,unread bigint,resume_version_id uuid,reinstatement_requested boolean)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 if not private.job_permission(target,'read') then raise exception 'Job access denied' using errcode='42501';end if;
 return query select a.id,a.stage::text,a.state::text,a.submitted_at,s.profile->>'full_name',s.profile->>'headline',s.profile->>'location',case when a.state='withdrawn' then null else s.profile->>'email' end,case when a.state='withdrawn' then '{}'::jsonb else s.answers end,
  not exists(select 1 from public.screening_questions q where q.job_id=a.job_id and q.must_have and coalesce(s.answers->>q.id::text,'')<>q.expected_answer),
  (select count(*) from public.application_messages m where m.application_id=a.id and m.sender_id=a.seeker_id and m.created_at>coalesce((select r.last_read_at from public.application_reads r where r.user_id=auth.uid() and r.application_id=a.id),'-infinity')),
  case when a.state='withdrawn' then null else s.resume_version_id end,a.reinstatement_requested_at is not null
 from public.applications a join public.application_snapshots s on s.application_id=a.id where a.job_id=target and a.state<>'draft' order by a.submitted_at desc limit 1000;
end $$;

create or replace function public.jp_candidate_extras(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare seeker uuid;
begin
 if not private.can_read_application(target) then raise exception 'Application unavailable' using errcode='42501';end if;
 select seeker_id into seeker from public.applications where id=target and (state<>'withdrawn' or seeker_id=auth.uid());
 if seeker is null then return null;end if;
 return (select jsonb_build_object('summary',p.summary,'experience',p.experience,'education',p.education,'licences',p.licences,'languages',p.languages,'readyToWork',p.ready_to_work,'availability',p.availability,
  'assessments',coalesce((select jsonb_agg(jsonb_build_object('title',a.title,'score',x.score,'level',private.assessment_level(x.score),'completedAt',x.completed_at) order by a.sort)
   from (select distinct on (code) code,score,completed_at,shared from public.assessment_attempts where user_id=seeker and completed_at is not null order by code,completed_at desc) x join public.assessments a on a.code=x.code where x.shared),'[]'::jsonb))
  from public.seeker_profiles p where p.user_id=seeker);
end $$;

-- 2. A company listed from its careers site and then handed to the employer counted as verified before its ABN had
--    been checked, so its new owner could search candidates, send invitations, run hiring events and buy advertising.
--    Those now wait until an administrator has verified the ABN.
create or replace function public.jp_search_candidates(company uuid,p_query text default null,p_near text default null,p_radius_km integer default 50,p_offset integer default 0)
returns table(user_id uuid,full_name text,headline text,location text,skills text[],distance_km double precision,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare q tsquery; lat0 double precision; lng0 double precision;
begin
 if auth.uid() is null or not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and not c.sourced and c.verified_at is not null and c.suspended_at is null) then
  raise exception 'Verified employer access required' using errcode='42501';end if;
 if nullif(trim(p_query),'') is not null then q:=websearch_to_tsquery('english',left(p_query,200));end if;
 if nullif(trim(p_near),'') is not null then select f.latitude,f.longitude into lat0,lng0 from public.jp_find_place(p_near) f;
  if lat0 is null then raise exception 'We do not recognise that place yet. Try a nearby city.' using errcode='22023';end if;end if;
 return query with found as (
  select p.user_id,p.full_name,p.headline,p.location,p.skills,
   case when lat0 is null then null else (select public.jp_distance_km(lat0,lng0,f.latitude,f.longitude) from public.jp_find_place(p.location) f) end as d,
   case when q is null then 0 else ts_rank_cd(to_tsvector('english',p.headline||' '||array_to_string(p.skills,' ')),q) end as r
  from public.seeker_profiles p
  where p.searchable and p.search_consent_at is not null
   and (q is null or to_tsvector('english',p.headline||' '||array_to_string(p.skills,' '))@@q)
   and not exists(select 1 from public.company_blocks b where b.seeker_id=p.user_id and b.company_id=company))
 select f.user_id,f.full_name,f.headline,f.location,f.skills,f.d,count(*) over() from found f
 where lat0 is null or f.d<=coalesce(p_radius_km,50)
 order by f.r desc,f.d nulls last,f.full_name limit 20 offset greatest(coalesce(p_offset,0),0);
end $$;

create or replace function public.jp_invite_candidate(target_job uuid,seeker uuid,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; invite uuid;
begin
 select * into j from public.jobs where id=target_job and state='live' and expires_at>now();
 if not found then raise exception 'Invite people to a live role' using errcode='22023';end if;
 if not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=j.company_id and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and not c.sourced and c.verified_at is not null and c.suspended_at is null) then raise exception 'Verified employer access required' using errcode='42501';end if;
 if not exists(select 1 from public.seeker_profiles where user_id=seeker and searchable) or exists(select 1 from public.company_blocks where seeker_id=seeker and company_id=j.company_id) then raise exception 'This person is not open to invitations' using errcode='22023';end if;
 if length(trim(coalesce(note,''))) not between 20 and 1000 then raise exception 'Write a message of 20 to 1000 characters' using errcode='22023';end if;
 if (select count(*) from public.candidate_invites where company_id=j.company_id and created_at>now()-interval '1 day')>=50 then raise exception 'Daily invitation limit reached' using errcode='22023';end if;
 insert into public.candidate_invites(company_id,job_id,seeker_id,sender_id,message) values(j.company_id,j.id,seeker,auth.uid(),trim(note)) on conflict(job_id,seeker_id) do nothing returning id into invite;
 if invite is null then raise exception 'You have already invited this person to this role' using errcode='22023';end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'candidate.invite','job',j.id,seeker::text);
 return jsonb_build_object('id',invite);
end $$;

create or replace function public.jp_can_buy_credit(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and not c.sourced and c.verified_at is not null) then
  raise exception 'Owners and recruiters of verified employers can buy advertising credit' using errcode='42501';end if;
 return jsonb_build_object('companyId',company,'name',(select name from public.companies where id=company));
end $$;

create or replace function public.jp_save_event(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company uuid:=(payload->>'companyId')::uuid; target uuid:=nullif(payload->>'id','')::uuid; s timestamptz; e timestamptz;
begin
 if target is not null then select company_id into company from public.hiring_events where id=target;end if;
 if company is null or not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and not c.sourced and c.verified_at is not null) then
  raise exception 'Owners and recruiters of verified employers can run hiring events' using errcode='42501';end if;
 begin s:=(payload->>'startsAt')::timestamptz;e:=(payload->>'endsAt')::timestamptz;exception when others then raise exception 'Choose a start and end time' using errcode='22023';end;
 if s is null or e is null or s<now() then raise exception 'Choose a start time in the future' using errcode='22023';end if;
 begin
  if target is null then
   insert into public.hiring_events(company_id,title,description,starts_at,ends_at,time_zone,mode,location,join_url,capacity,created_by)
   values(company,trim(payload->>'title'),trim(payload->>'description'),s,e,coalesce(payload->>'timeZone','Australia/Melbourne'),payload->>'mode',nullif(trim(coalesce(payload->>'location','')),''),nullif(trim(coalesce(payload->>'joinUrl','')),''),nullif(payload->>'capacity','')::int,auth.uid()) returning id into target;
  else
   update public.hiring_events set title=trim(payload->>'title'),description=trim(payload->>'description'),starts_at=s,ends_at=e,time_zone=coalesce(payload->>'timeZone',time_zone),mode=payload->>'mode',
    location=nullif(trim(coalesce(payload->>'location','')),''),join_url=nullif(trim(coalesce(payload->>'joinUrl','')),''),capacity=nullif(payload->>'capacity','')::int where id=target and cancelled_at is null;
  end if;
 exception when check_violation or not_null_violation or invalid_text_representation then
  raise exception 'Give a title, a description of at least 20 characters, an end after the start (within 3 days), and a location for in-person events' using errcode='22023';
 end;
 return jsonb_build_object('id',target);
end $$;

-- 3. Hiring managers only read applications and add notes, but could see every team member's email address and the
--    names and emails of everyone registered for the company's hiring events. They now see colleagues' addresses
--    shortened (j…@example.com), and attendee details are for owners and recruiters.
create or replace function public.jp_team(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships where company_id=company and user_id=auth.uid() and revoked_at is null) then raise exception 'Company access denied' using errcode='42501';end if;
 return jsonb_build_object(
  'members',(select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'email',case when private.owner_permission(company) or m.user_id=auth.uid() or exists(select 1 from public.company_memberships me where me.company_id=company and me.user_id=auth.uid() and me.revoked_at is null and me.role='recruiter') then u.email else left(u.email,1)||'…@'||split_part(u.email,'@',2) end,'role',m.role,'assignedJobs',(select count(*) from public.job_assignments ja join public.jobs j on j.id=ja.job_id where ja.user_id=m.user_id and j.company_id=company)) order by m.role,u.email),'[]')
   from public.company_memberships m join auth.users u on u.id=m.user_id where m.company_id=company and m.revoked_at is null),
  'invitations',case when private.owner_permission(company) then (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expiresAt',i.expires_at) order by i.expires_at),'[]') from public.company_invitations i where i.company_id=company and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) else '[]'::jsonb end,
  'isOwner',private.owner_permission(company));
end $$;

create or replace function public.jp_company_events(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null) then raise exception 'Employer access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',ev.id,'title',ev.title,'description',ev.description,'startsAt',ev.starts_at,'endsAt',ev.ends_at,'timeZone',ev.time_zone,'mode',ev.mode,'location',ev.location,'joinUrl',ev.join_url,'capacity',ev.capacity,'registered',ev.registered,'cancelled',ev.cancelled_at is not null,
  'attendees',case when not exists(select 1 from public.company_memberships me where me.company_id=company and me.user_id=auth.uid() and me.revoked_at is null and me.role in ('owner','recruiter')) then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('name',p.full_name,'email',coalesce(nullif(p.email,''),u.email),'headline',p.headline,'location',p.location) order by r.created_at) from public.event_registrations r join auth.users u on u.id=r.user_id left join public.seeker_profiles p on p.user_id=r.user_id where r.event_id=ev.id),'[]'::jsonb) end) order by ev.starts_at desc)
  from public.hiring_events ev where ev.company_id=company),'[]'::jsonb);
end $$;

-- 4. Job views are counted by a function anyone can call, so a script could inflate a listing's view count without
--    limit and distort the employer's statistics. The web server already limits each visitor; this adds a ceiling of
--    300 counted views per job per hour, which no single listing reaches in normal use.
alter table public.job_view_counts add column hour_start timestamptz,add column hour_views integer not null default 0;
create or replace function public.jp_record_job_view(target uuid) returns void language sql security definer set search_path='' as $$
 insert into public.job_view_counts(job_id,day,views,hour_start,hour_views) select j.id,current_date,1,date_trunc('hour',now()),1 from public.jobs j where j.id=target and j.state='live'
 on conflict(job_id,day) do update set views=public.job_view_counts.views+1,
  hour_start=date_trunc('hour',now()),
  hour_views=case when public.job_view_counts.hour_start=date_trunc('hour',now()) then public.job_view_counts.hour_views+1 else 1 end
 where public.job_view_counts.hour_start is distinct from date_trunc('hour',now()) or public.job_view_counts.hour_views<300
$$;

commit;
