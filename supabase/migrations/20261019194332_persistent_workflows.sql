begin;
create table private.platform_admins(user_id uuid primary key references auth.users(id),active boolean not null default true);
alter table private.platform_admins enable row level security;
revoke all on private.platform_admins from public,anon,authenticated;
alter table public.seeker_profiles add column email text not null default '';
alter table public.seeker_profiles add column resume_version_id uuid references public.resume_versions(id);
alter table public.resume_versions add column deleted_at timestamptz;
alter table public.applications add column reinstatement_requested_at timestamptz;
create table public.application_messages(id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id),sender_id uuid not null references auth.users(id),body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now());
create table public.company_blocks(seeker_id uuid not null references auth.users(id),company_id uuid not null references public.companies(id),created_at timestamptz not null default now(),primary key(seeker_id,company_id));
alter table public.application_messages enable row level security;
alter table public.company_blocks enable row level security;
revoke all on public.application_messages,public.company_blocks from anon,authenticated;
grant select on public.application_messages,public.company_blocks to authenticated;
create policy messages_read on public.application_messages for select to authenticated using(private.can_read_notes(application_id) or exists(select 1 from public.applications a where a.id=application_id and a.seeker_id=(select auth.uid()) and a.state<>'draft'));
create policy blocks_self on public.company_blocks for select to authenticated using(seeker_id=(select auth.uid()));
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from private.platform_admins where user_id=auth.uid() and active)$$;
create function private.job_permission(target uuid,operation text) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.jobs j join public.company_memberships m on m.company_id=j.company_id where j.id=target and m.user_id=auth.uid() and m.revoked_at is null and (m.role='owner' or (exists(select 1 from public.job_assignments a where a.job_id=j.id and a.user_id=m.user_id) and (m.role='recruiter' or (m.role='hiring_manager' and operation in ('read','note'))))))
$$;
create function private.owner_permission(target uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.company_memberships where company_id=target and user_id=auth.uid() and role='owner' and revoked_at is null)$$;
create function private.resume_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.resume_versions r where r.id=target and r.deleted_at is null and (r.user_id=auth.uid() or exists(select 1 from public.application_snapshots s join public.applications a on a.id=s.application_id where s.resume_version_id=r.id and a.state<>'draft' and private.job_permission(a.job_id,'read'))))
$$;
revoke all on function private.is_admin(),private.job_permission(uuid,text),private.owner_permission(uuid),private.resume_access(uuid) from public;
grant execute on function private.is_admin(),private.job_permission(uuid,text),private.owner_permission(uuid),private.resume_access(uuid) to authenticated;
create policy resumes_application_access on public.resume_versions for select to authenticated using(private.resume_access(id));
create policy membership_owner on public.company_memberships for select to authenticated using(private.owner_permission(company_id));
create policy profiles_admin on public.seeker_profiles for select to authenticated using(private.is_admin());
create policy companies_admin on public.companies for select to authenticated using(private.is_admin());
create policy jobs_admin on public.jobs for select to authenticated using(private.is_admin());
grant select on public.audit_log,public.company_verifications to authenticated;
create policy audit_admin on public.audit_log for select to authenticated using(private.is_admin());
create policy verification_admin on public.company_verifications for select to authenticated using(private.is_admin());
-- Only authenticated, authorized commands may write. Each RPC is one transaction.
-- The browser cannot choose its actor, seeker or reviewer ID.
create function private.jp_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); j public.jobs%rowtype; a public.applications%rowtype; r public.resume_versions%rowtype;
 profile public.seeker_profiles%rowtype; c public.companies%rowtype;
 target uuid; aid uuid; previous text; wanted text; role_value public.company_role;
 answers jsonb; answer text; item jsonb; reason text; now_at timestamptz:=now();
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid payload' using errcode='22023'; end if;
 case action
 when 'profile.save' then
  if length(trim(coalesce(payload->>'name','')))=0 or length(payload->>'name')>160 then raise exception 'Name is required' using errcode='22023';end if;
  insert into public.seeker_profiles(user_id,full_name,email,headline,location,skills,searchable,search_consent_at)
  values(actor,trim(payload->>'name'),coalesce((select email from auth.users where id=actor),''),left(coalesce(payload->>'headline',''),240),left(coalesce(payload->>'location',''),160),array(select jsonb_array_elements_text(coalesce(payload->'skills','[]'))),coalesce((payload->>'searchable')::boolean,false),case when (payload->>'searchable')::boolean then now_at else null end)
  on conflict(user_id) do update set full_name=excluded.full_name,email=excluded.email,headline=excluded.headline,location=excluded.location,skills=excluded.skills,searchable=excluded.searchable,search_consent_at=excluded.search_consent_at,updated_at=now_at;
  return jsonb_build_object('saved',true);
 when 'company.create' then
  if length(trim(coalesce(payload->>'name','')))<2 then raise exception 'Company name is required' using errcode='22023';end if;
  insert into public.companies(name,about,abn,is_agency) values(left(trim(payload->>'name'),160),left(coalesce(payload->>'about',''),5000),payload->>'abn',coalesce((payload->>'agency')::boolean,false)) returning id into target;
  insert into public.company_memberships values(target,actor,'owner',null);
  return jsonb_build_object('id',target);
 when 'job.save' then
  target:=(payload->>'id')::uuid;
  if target is not null then
   select * into j from public.jobs where id=target for update;
   if not found or not private.job_permission(target,'edit') then raise exception 'Job access denied' using errcode='42501';end if;
   if j.state in ('closed','expired') then raise exception 'A closed job cannot be edited' using errcode='22023';end if;
  else
   if not exists(select 1 from public.company_memberships where company_id=(payload->>'companyId')::uuid and user_id=actor and revoked_at is null and role in ('owner','recruiter')) then raise exception 'Company access denied' using errcode='42501';end if;
  end if;
  if nullif(trim(payload->>'title'),'') is null or length(coalesce(payload->>'description',''))<40 then raise exception 'Title and description are required' using errcode='22023';end if;
  if jsonb_array_length(coalesce(payload->'locations','[]'))=0 then raise exception 'A location is required' using errcode='22023';end if;
  wanted:=case when j.state='live' or payload->>'submit'='true' then 'pending_review' else 'draft' end;
  if target is null then
   insert into public.jobs(company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,currency,visa_sponsorship)
   values((payload->>'companyId')::uuid,payload->>'title',payload->>'description',wanted::public.job_state,payload->>'type',payload->>'arrangement',(payload->>'min')::numeric,(payload->>'max')::numeric,payload->>'period','AUD',coalesce((payload->>'sponsorship')::boolean,false)) returning id into target;
   insert into public.job_assignments values(target,actor) on conflict do nothing;
  else
   update public.jobs set title=payload->>'title',description=payload->>'description',state=wanted::public.job_state,employment_type=payload->>'type',arrangement=payload->>'arrangement',salary_min=(payload->>'min')::numeric,salary_max=(payload->>'max')::numeric,salary_period=payload->>'period',visa_sponsorship=coalesce((payload->>'sponsorship')::boolean,false) where id=target;
   delete from public.job_locations where job_id=target;
  end if;
  insert into public.job_locations(job_id,label) select target,value from jsonb_array_elements_text(payload->'locations');
  -- Questions cannot be silently rewritten after applications exist.
  if not exists(select 1 from public.screening_questions where job_id=target) then
   insert into public.screening_questions(job_id,question,required,must_have,expected_answer,position) values(target,coalesce(nullif(payload->>'screening',''),'Are you authorised to work in Australia?'),true,true,'Yes',0);
  end if;
  insert into private.outbox(event_type,entity_id) values('job.changed',target);
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'job.save','job',target,wanted);
  return jsonb_build_object('id',target,'state',wanted);
 when 'application.draft','application.submit' then
  target:=(payload->>'jobId')::uuid;
  select * into j from public.jobs where id=target for update;
  if not found or j.state<>'live' or j.expires_at<=now_at then raise exception 'Job is not accepting applications' using errcode='22023';end if;
  select * into c from public.companies where id=j.company_id;
  if c.verified_at is null or c.suspended_at is not null or c.is_agency then raise exception 'Job is not accepting applications' using errcode='22023';end if;
  insert into public.applications(job_id,seeker_id) values(target,actor) on conflict(job_id,seeker_id) do nothing;
  select * into a from public.applications where job_id=target and seeker_id=actor for update;
  if a.state<>'draft' then return jsonb_build_object('id',a.id,'existing',true,'state',a.state);end if;
  answers:=coalesce(payload->'answers','{}');
  if jsonb_typeof(answers)<>'object' then raise exception 'Invalid answers' using errcode='22023';end if;
  if payload->>'resumeId' is not null then
   select * into r from public.resume_versions where id=(payload->>'resumeId')::uuid and user_id=actor and deleted_at is null;
   if not found then raise exception 'Resume access denied' using errcode='42501';end if;
  end if;
  insert into public.application_drafts(application_id,resume_version_id,answers,cover_letter) values(a.id,r.id,answers,left(coalesce(payload->>'cover',''),5000))
  on conflict(application_id) do update set resume_version_id=excluded.resume_version_id,answers=excluded.answers,cover_letter=excluded.cover_letter,updated_at=now_at;
  if action='application.draft' then return jsonb_build_object('id',a.id,'state','draft');end if;
  if r.id is null then raise exception 'Select a resume' using errcode='22023';end if;
  select * into profile from public.seeker_profiles where user_id=actor;
  if not found then raise exception 'Complete your profile first' using errcode='22023';end if;
  if exists(select 1 from public.screening_questions q where q.job_id=target and q.required and coalesce(answers->>q.id::text,'') not in ('Yes','No')) then raise exception 'Answer all screening questions' using errcode='22023';end if;
  update public.applications set state='submitted',submitted_at=now_at where id=a.id;
  insert into public.application_snapshots(application_id,resume_version_id,profile,answers,cover_letter,submitted_at) values(a.id,r.id,to_jsonb(profile),answers,left(coalesce(payload->>'cover',''),5000),now_at);
  insert into public.application_stage_history(application_id,actor_id,from_state,to_state) values(a.id,actor,'draft','submitted');
  insert into private.outbox(event_type,entity_id) values('application.submitted',a.id);
  return jsonb_build_object('id',a.id,'state','submitted');
 when 'application.withdraw','application.request_reinstatement','application.reinstate','application.move','application.view','application.note','application.interview','message.send' then
  select * into a from public.applications where id=(payload->>'id')::uuid for update;
  if not found then raise exception 'Application not found' using errcode='42501';end if;
  if action='application.withdraw' then
   if a.seeker_id<>actor or a.state<>'submitted' then raise exception 'Cannot withdraw this application' using errcode='42501';end if;
   update public.applications set state='withdrawn',withdrawn_at=now_at,reinstatement_requested_at=null where id=a.id;
   insert into public.application_stage_history(application_id,actor_id,from_state,to_state) values(a.id,actor,'submitted','withdrawn');
  elsif action='application.request_reinstatement' then
   if a.seeker_id<>actor or a.state<>'withdrawn' then raise exception 'Cannot request reinstatement' using errcode='42501';end if;
   update public.applications set reinstatement_requested_at=now_at where id=a.id;
   insert into public.application_stage_history(application_id,actor_id,from_state,to_state) values(a.id,actor,'withdrawn','reinstatement_requested');
  elsif action='application.reinstate' then
   if not private.job_permission(a.job_id,'move') or a.state<>'withdrawn' or a.reinstatement_requested_at is null then raise exception 'Seeker confirmation and employer permission required' using errcode='42501';end if;
   update public.applications set state='submitted',withdrawn_at=null,reinstatement_requested_at=null where id=a.id;
   insert into public.application_stage_history(application_id,actor_id,from_state,to_state) values(a.id,actor,'withdrawn','reinstated');
  elsif action='application.move' then
   if not private.job_permission(a.job_id,'move') or a.state<>'submitted' then raise exception 'Stage change denied' using errcode='42501';end if;
   update public.applications set stage=(payload->>'stage')::public.hiring_stage where id=a.id;
   insert into public.application_stage_history(application_id,actor_id,from_state,to_state) values(a.id,actor,a.stage,payload->>'stage');
  elsif action='application.view' then
   if not private.job_permission(a.job_id,'read') or a.state='draft' then raise exception 'View denied' using errcode='42501';end if;
   insert into public.application_views(application_id,viewer_id) values(a.id,actor);
  elsif action='application.note' then
   if not private.job_permission(a.job_id,'note') or a.state='draft' then raise exception 'Note denied' using errcode='42501';end if;
   if length(trim(coalesce(payload->>'body','')))=0 then raise exception 'A note is required' using errcode='22023';end if;
   insert into public.application_notes(application_id,author_id,body,rating) values(a.id,actor,left(payload->>'body',5000),(payload->>'rating')::smallint);
  elsif action='application.interview' then
   if not private.job_permission(a.job_id,'move') or a.state<>'submitted' then raise exception 'Interview access denied' using errcode='42501';end if;
   if payload->>'cancel'='true' then
    update public.interviews set cancelled_at=now_at where application_id=a.id and cancelled_at is null;
   else
    if (payload->>'at')::timestamptz<=now_at or not exists(select 1 from pg_catalog.pg_timezone_names where name=payload->>'timeZone') then raise exception 'Future time and valid timezone required' using errcode='22023';end if;
    update public.interviews set cancelled_at=now_at where application_id=a.id and cancelled_at is null;
    insert into public.interviews(application_id,starts_at,time_zone,format,created_by) values(a.id,(payload->>'at')::timestamptz,payload->>'timeZone',left(coalesce(payload->>'format','Video interview'),500),actor);
   end if;
  elsif action='message.send' then
   if a.state='draft' or (a.seeker_id<>actor and not private.job_permission(a.job_id,'message')) then raise exception 'Message access denied' using errcode='42501';end if;
   if exists(select 1 from public.company_blocks b join public.jobs blocked_job on blocked_job.company_id=b.company_id where b.seeker_id=a.seeker_id and blocked_job.id=a.job_id) then raise exception 'Conversation is blocked' using errcode='42501';end if;
   insert into public.application_messages(application_id,sender_id,body) values(a.id,actor,trim(payload->>'body'));
  end if;
  insert into private.outbox(event_type,entity_id) values(action,a.id);
  return jsonb_build_object('id',a.id);
 when 'job.state' then
  select * into j from public.jobs where id=(payload->>'id')::uuid for update;
  if not found or not private.job_permission(j.id,'edit') then raise exception 'Job access denied' using errcode='42501';end if;
  wanted:=payload->>'state';
  if wanted not in ('paused','closed','pending_review') or j.state in ('closed','expired') then raise exception 'Invalid job transition' using errcode='22023';end if;
  update public.jobs set state=wanted::public.job_state where id=j.id;
  insert into private.outbox(event_type,entity_id,payload) values('job.state',j.id,jsonb_build_object('from',j.state,'to',wanted));
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'job.state','job',j.id,wanted);
  return jsonb_build_object('id',j.id);
 when 'member.remove' then
  target:=(payload->>'companyId')::uuid;
  if not private.owner_permission(target) or (payload->>'userId')::uuid=actor then raise exception 'Membership change denied' using errcode='42501';end if;
  update public.company_memberships set revoked_at=now_at where company_id=target and user_id=(payload->>'userId')::uuid and role<>'owner';
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'member.remove','company',target,'Owner removed membership');
  return jsonb_build_object('saved',true);
 when 'job.review' then
  if not private.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  reason:=trim(coalesce(payload->>'reason',''));if length(reason)<3 then raise exception 'Reason required' using errcode='22023';end if;
  select * into j from public.jobs where id=(payload->>'id')::uuid for update;
  if not found or j.state<>'pending_review' then raise exception 'Job is not pending review' using errcode='22023';end if;
  select * into c from public.companies where id=j.company_id;
  wanted:=payload->>'decision';
  if wanted not in ('approve','reject') then raise exception 'Invalid decision' using errcode='22023';end if;
  if wanted='approve' and (c.verified_at is null or c.suspended_at is not null or c.is_agency) then raise exception 'Verified employer and agency paid activation required' using errcode='22023';end if;
  update public.jobs set state=case when wanted='approve' then 'live'::public.job_state else 'closed'::public.job_state end,published_at=case when wanted='approve' then now_at else published_at end,expires_at=case when wanted='approve' then now_at+interval '30 days' else expires_at end where id=j.id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'job.'||wanted,'job',j.id,reason);
  insert into private.outbox(event_type,entity_id) values('job.reviewed',j.id);
  return jsonb_build_object('id',j.id);
 when 'company.verify' then
  if not private.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  reason:=trim(coalesce(payload->>'reason',''));if length(reason)<3 then raise exception 'Reason required' using errcode='22023';end if;
  target:=(payload->>'id')::uuid;
  if length(trim(coalesce(payload->>'evidenceReference','')))<3 then raise exception 'Evidence reference required' using errcode='22023';end if;
  insert into public.company_verifications(company_id,reviewer_id,abn_matched,evidence_type,evidence_reference,decision,reason) values(target,actor,(payload->>'abnMatched')::boolean,payload->>'evidenceType',payload->>'evidenceReference','approved',reason);
  update public.companies set verified_at=now_at where id=target;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'company.verified','company',target,reason);
  return jsonb_build_object('id',target);
 when 'saved.toggle' then
  target:=(payload->>'jobId')::uuid;
  if payload->>'saved'='true' then insert into public.saved_jobs values(actor,target,now_at) on conflict do nothing;else delete from public.saved_jobs where user_id=actor and job_id=target;end if;
  return jsonb_build_object('saved',payload->>'saved'='true');
 when 'company.block' then
  target:=(payload->>'companyId')::uuid;
  if payload->>'blocked'='true' then insert into public.company_blocks values(actor,target,now_at) on conflict do nothing;else delete from public.company_blocks where seeker_id=actor and company_id=target;end if;
  return jsonb_build_object('saved',true);
 else raise exception 'Unknown command' using errcode='22023';
 end case;
end $$;
revoke all on function private.jp_command(text,jsonb) from public;
grant execute on function private.jp_command(text,jsonb) to authenticated;
create function public.jp_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.jp_command(action,payload)$$;
revoke all on function public.jp_command(text,jsonb) from public,anon;
grant execute on function public.jp_command(text,jsonb) to authenticated;
create function public.jp_is_admin() returns boolean language sql stable security invoker set search_path='' as $$select private.is_admin()$$;
revoke all on function public.jp_is_admin() from public,anon;
grant execute on function public.jp_is_admin() to authenticated;
-- Immutable submissions are insert-only, including for accidental service updates.
create function private.immutable_snapshot() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Submitted snapshots are immutable';end$$;
revoke all on function private.immutable_snapshot() from public;
create trigger snapshot_no_update before update on public.application_snapshots for each row execute function private.immutable_snapshot();
commit;
