-- Paid sponsored listings (Stripe), opted-in candidate search with invitations, automatic risk flags on new
-- listings, and an employer responsiveness measure.
begin;
create table public.job_sponsorships(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id),company_id uuid not null references public.companies(id),
 purchased_by uuid not null references auth.users(id),stripe_session_id text not null unique,amount_total integer not null check(amount_total>=0),currency text not null default 'aud',
 starts_at timestamptz not null default now(),ends_at timestamptz not null,created_at timestamptz not null default now(),check(ends_at>starts_at)
);
create index job_sponsorships_active on public.job_sponsorships(job_id,ends_at);
alter table public.job_sponsorships enable row level security;
revoke all on public.job_sponsorships from anon,authenticated;
grant select(id,job_id,company_id,amount_total,currency,starts_at,ends_at,created_at) on public.job_sponsorships to authenticated;
create policy sponsorships_team on public.job_sponsorships for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=job_sponsorships.company_id and m.user_id=(select auth.uid()) and m.revoked_at is null and m.role in ('owner','recruiter')) or private.is_admin());
-- Anyone may know that a role is sponsored right now, as search labels it; amounts stay with the employer.
create function public.jp_active_sponsorships(targets uuid[]) returns setof uuid language sql stable security definer set search_path='' as $$
 select distinct job_id from public.job_sponsorships where job_id=any(targets) and now() between starts_at and ends_at
$$;
grant execute on function public.jp_active_sponsorships(uuid[]) to anon,authenticated;

-- The billing function checks this with the buyer's own token before creating a Stripe checkout.
create function public.jp_can_sponsor(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j public.jobs%rowtype;
begin
 select * into j from public.jobs where id=target;
 if not found or not exists(select 1 from public.company_memberships m where m.company_id=j.company_id and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter')) then raise exception 'Employer access required' using errcode='42501';end if;
 if j.state<>'live' or j.expires_at<=now() then raise exception 'Only live roles can be sponsored' using errcode='22023';end if;
 return jsonb_build_object('jobId',j.id,'companyId',j.company_id,'title',j.title);
end $$;
revoke all on function public.jp_can_sponsor(uuid) from public,anon;
grant execute on function public.jp_can_sponsor(uuid) to authenticated;

-- Called by the billing webhook after Stripe confirms payment. Idempotent per checkout session; a new purchase
-- for an already-sponsored role extends it from the current end date.
create function public.jp_record_sponsorship(session text,target uuid,buyer uuid,amount integer,cur text,days integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; begins timestamptz; existing uuid;
begin
 select id into existing from public.job_sponsorships where stripe_session_id=session;
 if existing is not null then return jsonb_build_object('id',existing,'duplicate',true);end if;
 select * into j from public.jobs where id=target;if not found then raise exception 'Job not found' using errcode='22023';end if;
 if days not between 1 and 90 then raise exception 'Invalid duration' using errcode='22023';end if;
 select greatest(now(),coalesce(max(ends_at),now())) into begins from public.job_sponsorships where job_id=target;
 insert into public.job_sponsorships(job_id,company_id,purchased_by,stripe_session_id,amount_total,currency,starts_at,ends_at)
 values(target,j.company_id,buyer,session,amount,lower(cur),begins,begins+make_interval(days=>days)) returning id into existing;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(buyer,'job.sponsor','job',target,session);
 return jsonb_build_object('id',existing);
end $$;
revoke all on function public.jp_record_sponsorship(text,uuid,uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.jp_record_sponsorship(text,uuid,uuid,integer,text,integer) to service_role;

drop function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer);
create function public.jp_search_jobs(p_query text default null,p_query_mode text default 'websearch',p_location text default null,p_company text default null,p_arrangement text default null,p_type text default null,
 p_salary_min numeric default null,p_salary_max numeric default null,p_period text default 'year',p_posted_days integer default null,p_near text default null,p_radius_km integer default null,
 p_sort text default 'relevance',p_limit integer default 20,p_offset integer default 0)
returns table(job_id uuid,rank real,distance_km double precision,total_count bigint,sponsored boolean)
language plpgsql stable security invoker set search_path='' as $$
declare q tsquery; lat0 double precision; lng0 double precision;
 esc text:='\';
begin
 -- 'tsquery' mode takes a query the application built from sanitised words and synonym groups.
 if nullif(trim(p_query),'') is not null then q:=case when p_query_mode='tsquery' then to_tsquery('english',left(p_query,2000)) else websearch_to_tsquery('english',left(p_query,300)) end;end if;
 if nullif(trim(p_near),'') is not null then
  select p.latitude,p.longitude into lat0,lng0 from public.jp_find_place(p_near) p;
  if lat0 is null then raise exception 'We do not recognise that place yet. Try a nearby city.' using errcode='22023';end if;
 end if;
 return query
 with matches as (
  select j.id,j.published_at,j.salary_min,exists(select 1 from public.jp_active_sponsorships(array[j.id])) as sp,
   case when q is null then 0::real else ts_rank_cd(j.search_vector,q) end as r,
   case when lat0 is null then null else (select min(public.jp_distance_km(lat0,lng0,l.latitude,l.longitude)) from public.job_locations l where l.job_id=j.id and l.latitude is not null) end as d
  from public.jobs j join public.companies c on c.id=j.company_id
  -- Repeats the public-listing rule so service-role callers (job alerts) see only what the public sees.
  where j.state='live' and j.expires_at>now() and c.verified_at is not null and c.suspended_at is null and not c.is_agency
   and (q is null or j.search_vector@@q or to_tsvector('english',c.name)@@q)
   and (nullif(trim(p_location),'') is null or exists(select 1 from public.job_locations l where l.job_id=j.id and l.label ilike '%'||replace(replace(replace(trim(p_location),esc,esc||esc),'%',esc||'%'),'_',esc||'_')||'%'))
   and (nullif(trim(p_company),'') is null or c.name ilike '%'||replace(replace(replace(trim(p_company),esc,esc||esc),'%',esc||'%'),'_',esc||'_')||'%')
   and (nullif(p_arrangement,'') is null or j.arrangement=p_arrangement)
   and (nullif(p_type,'') is null or j.employment_type=p_type)
   and ((p_salary_min is null and p_salary_max is null and p_sort<>'salary') or (j.salary_period=p_period and j.currency='AUD'))
   and (p_salary_min is null or j.salary_max>=p_salary_min)
   and (p_salary_max is null or j.salary_min<=p_salary_max)
   and (p_posted_days is null or j.published_at>=now()-make_interval(days=>p_posted_days))
 )
 select m.id,m.r,m.d,count(*) over(),m.sp from matches m
 where lat0 is null or (m.d is not null and m.d<=coalesce(p_radius_km,25))
 order by
  case when p_sort='salary' then m.salary_min end desc nulls last,
  case when p_sort='distance' then m.d end asc nulls last,
  -- Paid sponsorship lifts a matching role within best-match results; it never makes a role match.
  case when p_sort='relevance' and q is not null then m.r*case when m.sp then 1.5 else 1 end end desc nulls last,
  case when p_sort='relevance' and q is null then m.sp end desc nulls last,
  m.published_at desc,m.id
 limit least(greatest(coalesce(p_limit,20),1),50) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer) from public;
grant execute on function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer) to anon,authenticated,service_role;


-- Candidate search: verified employers see only profiles whose owners opted in, and only the fields they chose to show.
create table public.candidate_invites(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),job_id uuid not null references public.jobs(id),
 seeker_id uuid not null references auth.users(id),sender_id uuid not null references auth.users(id),message text not null check(length(message) between 20 and 1000),
 created_at timestamptz not null default now(),dismissed_at timestamptz,unique(job_id,seeker_id)
);
alter table public.candidate_invites enable row level security;
revoke all on public.candidate_invites from anon,authenticated;
grant select on public.candidate_invites to authenticated;
create policy invites_seeker on public.candidate_invites for select to authenticated using(seeker_id=(select auth.uid()));
create policy invites_team on public.candidate_invites for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=candidate_invites.company_id and m.user_id=(select auth.uid()) and m.revoked_at is null and m.role in ('owner','recruiter')));

create function public.jp_search_candidates(company uuid,p_query text default null,p_near text default null,p_radius_km integer default 50,p_offset integer default 0)
returns table(user_id uuid,full_name text,headline text,location text,skills text[],distance_km double precision,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare q tsquery; lat0 double precision; lng0 double precision;
begin
 if auth.uid() is null or not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and c.verified_at is not null and c.suspended_at is null) then
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
revoke all on function public.jp_search_candidates(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.jp_search_candidates(uuid,text,text,integer,integer) to authenticated;

create function public.jp_invite_candidate(target_job uuid,seeker uuid,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; invite uuid;
begin
 select * into j from public.jobs where id=target_job and state='live' and expires_at>now();
 if not found then raise exception 'Invite people to a live role' using errcode='22023';end if;
 if not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id where m.company_id=j.company_id and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter') and c.verified_at is not null and c.suspended_at is null) then raise exception 'Verified employer access required' using errcode='42501';end if;
 if not exists(select 1 from public.seeker_profiles where user_id=seeker and searchable) or exists(select 1 from public.company_blocks where seeker_id=seeker and company_id=j.company_id) then raise exception 'This person is not open to invitations' using errcode='22023';end if;
 if length(trim(coalesce(note,''))) not between 20 and 1000 then raise exception 'Write a message of 20 to 1000 characters' using errcode='22023';end if;
 if (select count(*) from public.candidate_invites where company_id=j.company_id and created_at>now()-interval '1 day')>=50 then raise exception 'Daily invitation limit reached' using errcode='22023';end if;
 insert into public.candidate_invites(company_id,job_id,seeker_id,sender_id,message) values(j.company_id,j.id,seeker,auth.uid(),trim(note)) on conflict(job_id,seeker_id) do nothing returning id into invite;
 if invite is null then raise exception 'You have already invited this person to this role' using errcode='22023';end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'candidate.invite','job',j.id,seeker::text);
 return jsonb_build_object('id',invite);
end $$;
create function public.jp_dismiss_invite(target uuid) returns boolean language sql security definer set search_path='' as $$
 update public.candidate_invites set dismissed_at=now() where id=target and seeker_id=auth.uid() and dismissed_at is null returning true
$$;
revoke all on function public.jp_invite_candidate(uuid,uuid,text),public.jp_dismiss_invite(uuid) from public,anon;
grant execute on function public.jp_invite_candidate(uuid,uuid,text),public.jp_dismiss_invite(uuid) to authenticated;

-- Risk signals for moderators, computed on every save. Stored privately so employers cannot read or tune against them.
create table private.job_risk(job_id uuid primary key references public.jobs(id) on delete cascade,flags text[] not null,checked_at timestamptz not null default now());
alter table private.job_risk enable row level security;
revoke all on private.job_risk from public,anon,authenticated;
create function private.risk_flags(title text,description text,min numeric,max numeric,period text,employment text) returns text[] language sql immutable set search_path='' as $$
 select array_remove(array[
  case when (title||' '||description) ~* '(upfront|joining|registration|training|starter[ -]?kit)\s+(fee|payment|cost)|pay (a|the) (fee|deposit)' then 'Asks applicants to pay' end,
  case when (title||' '||description) ~* '\m(telegram|whatsapp|signal app|wechat)\M' then 'Moves contact to a messaging app' end,
  case when (title||' '||description) ~* '\m(bitcoin|crypto|usdt|gift ?cards?|western union|money transfer)\M' then 'Mentions crypto, gift cards or money transfers' end,
  case when description ~* '[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|proton|icloud)\.' then 'Personal email address in the listing' end,
  case when (title||' '||description) ~* 'earn \$?[0-9,]+ (a|per) (day|week)|no experience (needed|required).{0,40}\$[0-9]|work from home and earn|be your own boss' then 'Too-good-to-be-true pay claims' end,
  case when (period='hour' and max>300) or (period='day' and max>3000) or (period='year' and max>1000000) then 'Unusually high pay' end,
  case when employment in ('Full-time','Part-time','Casual') and ((period='hour' and min<20) or (period='year' and employment='Full-time' and min<45000)) then 'Pay may be below the national minimum wage' end,
  case when max>min*3 and min>0 then 'Very wide pay range' end
 ],null)
$$;
create function private.flag_job() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.job_risk(job_id,flags) values(new.id,private.risk_flags(new.title,new.description,new.salary_min,new.salary_max,new.salary_period,new.employment_type))
 on conflict(job_id) do update set flags=excluded.flags,checked_at=now();
 return new;
end $$;
revoke all on function private.flag_job() from public,anon,authenticated;
create trigger job_risk_flags after insert or update of title,description,salary_min,salary_max,salary_period,employment_type on public.jobs for each row execute function private.flag_job();
insert into private.job_risk(job_id,flags) select id,private.risk_flags(title,description,salary_min,salary_max,salary_period,employment_type) from public.jobs on conflict do nothing;
create function public.jp_job_risk(targets uuid[]) returns table(job_id uuid,flags text[]) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return query select r.job_id,r.flags from private.job_risk r where r.job_id=any(targets) and cardinality(r.flags)>0;
end $$;
revoke all on function public.jp_job_risk(uuid[]) from public,anon;
grant execute on function public.jp_job_risk(uuid[]) to authenticated;

-- How quickly an employer acts on applications: median days from submission to the first stage change, last 180 days.
create function public.jp_company_responsiveness(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with apps as (select a.id,a.submitted_at,(select min(h.created_at) from public.application_stage_history h where h.application_id=a.id and h.actor_id<>a.seeker_id) as first_action
  from public.applications a join public.jobs j on j.id=a.job_id join public.companies c on c.id=j.company_id
  where j.company_id=company and c.verified_at is not null and a.state<>'draft' and a.submitted_at>now()-interval '180 days')
 select case when count(*)<5 then null else jsonb_build_object('applications',count(*),'respondedShare',round(100.0*count(first_action)/count(*)),
  'medianDays',round((percentile_cont(.5) within group (order by extract(epoch from first_action-submitted_at)/86400) filter (where first_action is not null))::numeric,1)) end from apps
$$;
grant execute on function public.jp_company_responsiveness(uuid) to anon,authenticated;
commit;
