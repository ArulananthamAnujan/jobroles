-- Filling the board: administrators list an employer's public careers feed (Greenhouse, Lever, Ashby, SmartRecruiters,
-- or an XML/JSON feed) before that employer has joined. Those "sourced" companies have no members, their roles link to
-- the employer's own application page, and they are labelled as coming from the employer's careers site rather than as
-- ABN-verified. Imported roles may have no stated pay; roles posted directly still need a pay range (jp_command checks it).
begin;
alter table public.companies add column sourced boolean not null default false;
comment on column public.companies.sourced is 'Listed by JobRoles from the employer''s public careers feed. verified_at is set so the roles are public, but the employer has not been ABN-checked: show "From the employer''s careers site", never "Verified".';
alter table public.job_feeds drop constraint job_feeds_format_check;
alter table public.job_feeds add constraint job_feeds_format_check check(format in ('json','xml','greenhouse','lever','ashby','smartrecruiters'));
-- Roles from this feed are applied for on the employer's site.
alter table public.job_feeds add column external_apply boolean not null default false;
grant select(external_apply) on public.job_feeds to authenticated;

create or replace function public.jp_feed_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare actor uuid:=auth.uid(); f public.job_feeds%rowtype; target uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 case action
 when 'create' then
  target:=(payload->>'companyId')::uuid;
  if not private.owner_permission(target) then raise exception 'Company owner required' using errcode='42501';end if;
  if not exists(select 1 from public.companies where id=target and verified_at is not null and suspended_at is null) then raise exception 'Only verified employers can import jobs' using errcode='22023';end if;
  if (select count(*) from public.job_feeds where company_id=target)>=5 then raise exception 'Up to five feeds per company' using errcode='22023';end if;
  if coalesce(payload->>'url','') !~ '^https://[^\s/]+[^\s]*$' or length(payload->>'url')>2000 or coalesce(payload->>'format','') not in ('json','xml','greenhouse','lever','ashby','smartrecruiters') then raise exception 'Enter an https feed address and its format' using errcode='22023';end if;
  insert into public.job_feeds(company_id,url,format,created_by) values(target,payload->>'url',payload->>'format',actor) returning id into target;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'feed.create','job_feed',target,payload->>'url');
  return jsonb_build_object('id',target);
 when 'pause','resume','delete' then
  select * into f from public.job_feeds where id=(payload->>'id')::uuid for update;
  if not found or not (private.owner_permission(f.company_id) or private.is_admin()) then raise exception 'Feed access denied' using errcode='42501';end if;
  if action='delete' then
   update public.jobs set state='closed' where id in (select job_id from public.job_feed_items where feed_id=f.id) and state in ('live','pending_review','paused','draft');
   delete from public.job_feeds where id=f.id;
  else update public.job_feeds set active=(action='resume') where id=f.id;end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'feed.'||action,'job_feed',f.id,f.url);
  return jsonb_build_object('ok',true);
 when 'trust' then
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
  update public.job_feeds set auto_publish=coalesce((payload->>'autoPublish')::boolean,false) where id=(payload->>'id')::uuid returning * into f;
  if not found then raise exception 'Feed not found' using errcode='22023';end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'feed.trust','job_feed',f.id,f.auto_publish::text);
  return jsonb_build_object('ok',true);
 else raise exception 'Unknown feed action' using errcode='22023';
 end case;
end $fn$;

-- Nobody at a sourced company can receive an application made here.
create function private.block_sourced_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.jobs j join public.companies c on c.id=j.company_id where j.id=new.job_id and c.sourced and j.external_apply_url is not null) then
  raise exception 'Apply for this role on the employer''s website' using errcode='22023';
 end if;
 return new;
end $$;
create trigger applications_not_sourced before insert on public.applications for each row execute function private.block_sourced_application();

create function public.jp_source_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); c public.companies%rowtype; f public.job_feeds%rowtype; target uuid; member uuid; site text;
begin
 if actor is null or not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 case action
 when 'create' then
  if length(trim(coalesce(payload->>'name','')))<2 or length(payload->>'name')>160 then raise exception 'Enter the employer''s name' using errcode='22023';end if;
  if coalesce(payload->>'url','') !~ '^https://[^\s/]+[^\s]*$' or length(payload->>'url')>2000 or coalesce(payload->>'format','') not in ('json','xml','greenhouse','lever','ashby','smartrecruiters') then raise exception 'Enter an https feed address and its format' using errcode='22023';end if;
  site:=nullif(trim(coalesce(payload->>'website','')),'');
  if site is not null and (site !~ '^https://' or length(site)>300) then raise exception 'The website must start with https://' using errcode='22023';end if;
  select * into c from public.companies where lower(name)=lower(trim(payload->>'name')) and sourced limit 1;
  if not found then
   if exists(select 1 from public.companies where lower(name)=lower(trim(payload->>'name'))) then raise exception 'That employer already has an account. Ask them to add the feed from Import jobs in their portal.' using errcode='22023';end if;
   insert into public.companies(name,about,website,verified_at,sourced) values(trim(payload->>'name'),left(coalesce(payload->>'about',''),5000),site,now(),true) returning * into c;
  end if;
  if exists(select 1 from public.job_feeds where company_id=c.id and url=payload->>'url') then raise exception 'That feed is already listed' using errcode='22023';end if;
  if (select count(*) from public.job_feeds where company_id=c.id)>=5 then raise exception 'Up to five feeds per company' using errcode='22023';end if;
  insert into public.job_feeds(company_id,url,format,created_by,auto_publish,external_apply) values(c.id,payload->>'url',payload->>'format',actor,coalesce((payload->>'autoPublish')::boolean,true),true) returning id into target;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'source.create','job_feed',target,c.name||' · '||(payload->>'url'));
  return jsonb_build_object('companyId',c.id,'feedId',target);
 when 'run' then
  -- Makes the feed due again; the import worker picks it up on its next pass.
  update public.job_feeds set last_run_at=null,lease=null,lease_until=null where id=(payload->>'id')::uuid returning * into f;
  if not found then raise exception 'Feed not found' using errcode='22023';end if;
  return jsonb_build_object('ok',true);
 when 'claim' then
  -- Hands a sourced company to the employer. It keeps its "careers site" label until its ABN is verified.
  select * into c from public.companies where id=(payload->>'companyId')::uuid and sourced for update;
  if not found then raise exception 'Sourced company not found' using errcode='22023';end if;
  select id into member from auth.users where lower(email)=lower(trim(payload->>'email')) and email_confirmed_at is not null limit 1;
  if member is null then raise exception 'No confirmed account uses that email. Ask the employer to sign up first.' using errcode='22023';end if;
  insert into public.company_memberships(company_id,user_id,role) values(c.id,member,'owner') on conflict(company_id,user_id) do update set role='owner',revoked_at=null;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'source.claim','company',c.id,lower(trim(payload->>'email')));
  return jsonb_build_object('ok',true);
 when 'verify' then
  -- After the usual ABN check: the company becomes a normal verified employer. Its feeds keep sending applicants to its own site.
  if coalesce(payload->>'abn','') !~ '^\d{11}$' or length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Enter the 11-digit ABN and what you checked' using errcode='22023';end if;
  update public.companies set sourced=false,abn=payload->>'abn',verified_at=now() where id=(payload->>'companyId')::uuid and sourced returning * into c;
  if not found then raise exception 'Sourced company not found' using errcode='22023';end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'company.verified','company',c.id,left(payload->>'reason',500));
  return jsonb_build_object('ok',true);
 else raise exception 'Unknown source action' using errcode='22023';
 end case;
end $$;
revoke all on function public.jp_source_command(text,jsonb) from public,anon;
grant execute on function public.jp_source_command(text,jsonb) to authenticated;

create function public.jp_sources() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return jsonb_build_object(
  'totals',jsonb_build_object(
   'live',(select count(*) from public.jobs j where j.state='live' and j.expires_at>now()),
   'sourced',(select count(*) from public.jobs j join public.companies c on c.id=j.company_id where j.state='live' and j.expires_at>now() and c.sourced),
   'withPay',(select count(*) from public.jobs j where j.state='live' and j.expires_at>now() and j.salary_min is not null),
   'employers',(select count(*) from public.companies where sourced and suspended_at is null)),
  'sources',coalesce((select jsonb_agg(s order by s->>'company',s->>'createdAt') from (
   select jsonb_build_object('id',f.id,'companyId',c.id,'company',c.name,'website',c.website,'url',f.url,'format',f.format,'active',f.active,'autoPublish',f.auto_publish,
    'createdAt',f.created_at,'lastRunAt',f.last_run_at,'lastStatus',f.last_status,'lastError',f.last_error,
    'live',(select count(*) from public.job_feed_items i join public.jobs j on j.id=i.job_id where i.feed_id=f.id and j.state='live' and j.expires_at>now()),
    'waiting',(select count(*) from public.job_feed_items i join public.jobs j on j.id=i.job_id where i.feed_id=f.id and j.state='pending_review'),
    'owners',(select count(*) from public.company_memberships m where m.company_id=c.id and m.revoked_at is null)) as s
   from public.job_feeds f join public.companies c on c.id=f.company_id where c.sourced) x),'[]'::jsonb));
end $$;
revoke all on function public.jp_sources() from public,anon;
grant execute on function public.jp_sources() to authenticated;

-- Import: pay is optional, and feeds marked external_apply keep the employer's application link.
create or replace function public.jp_import_feed(feed uuid,lease uuid,items jsonb,problem text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.job_feeds%rowtype; item jsonb; existing uuid; target uuid; created int:=0; updated int:=0; closed int:=0; rejected int:=0; seen text[]:='{}'; state_value public.job_state; expires timestamptz;
 lo numeric; hi numeric; per text; link text;
begin
 select * into f from public.job_feeds where id=feed and job_feeds.lease=jp_import_feed.lease for update;
 if not found then raise exception 'Feed lease expired' using errcode='22023';end if;
 if items is null or jsonb_typeof(items)<>'array' then
  update public.job_feeds set last_run_at=now(),last_status='failed',last_error=left(coalesce(problem,'Feed could not be read'),500),lease=null,lease_until=null where id=feed;
  return jsonb_build_object('failed',true);
 end if;
 for item in select * from jsonb_array_elements(items) limit 2000 loop
  lo:=(item->>'min')::numeric;hi:=(item->>'max')::numeric;per:=item->>'period';
  link:=case when f.external_apply and coalesce(item->>'applyUrl','') ~ '^https://[^\s]+$' and length(item->>'applyUrl')<=500 then item->>'applyUrl' end;
  if coalesce(item->>'externalId','')='' or length(item->>'externalId')>200 or coalesce(trim(item->>'title'),'')='' or length(item->>'title')>140 or length(coalesce(item->>'description',''))<40
   or coalesce(item->>'type','') not in ('Full-time','Part-time','Casual','Contract','Temporary','Internship') or coalesce(item->>'arrangement','') not in ('on_site','hybrid','remote')
   or jsonb_typeof(item->'locations')<>'array' or jsonb_array_length(item->'locations') not between 1 and 20
   -- Pay is either absent altogether or a complete, sensible range.
   or not ((lo is null and hi is null) or (lo is not null and hi is not null and lo>=0 and hi>=lo and coalesce(per,'') in ('hour','day','month','year')))
   -- A feed that sends people to the employer's site must say where.
   or (f.external_apply and link is null)
   or (item->>'externalId')=any(seen) then rejected:=rejected+1;continue;end if;
  if lo is null then per:=null;end if;
  seen:=seen||(item->>'externalId');
  expires:=least(coalesce((item->>'expiresAt')::timestamptz,now()+interval '30 days'),now()+interval '60 days');
  select job_id into existing from public.job_feed_items where feed_id=feed and external_id=item->>'externalId';
  if existing is null then
   state_value:=case when f.auto_publish then 'live' else 'pending_review' end;
   insert into public.jobs(company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,expires_at,external_apply_url)
   values(f.company_id,trim(item->>'title'),left(item->>'description',30000),state_value,item->>'type',item->>'arrangement',lo,hi,per,'AUD',
    -- Listings from a careers site keep the date the employer first advertised them.
    case when f.auto_publish then least(coalesce((item->>'postedAt')::timestamptz,now()),now()) end,case when f.auto_publish then expires end,link) returning id into target;
   insert into public.job_locations(job_id,label) select target,left(value,160) from jsonb_array_elements_text(item->'locations');
   if link is null then insert into public.screening_questions(job_id,question,required,must_have,expected_answer,position) values(target,'Are you authorised to work in Australia?',true,true,'Yes',0);end if;
   insert into public.job_feed_items(feed_id,external_id,job_id) values(feed,item->>'externalId',target);
   insert into private.outbox(event_type,entity_id) values('job.changed',target);
   created:=created+1;
  else
   update public.jobs j set title=trim(item->>'title'),description=left(item->>'description',30000),employment_type=item->>'type',arrangement=item->>'arrangement',salary_min=lo,salary_max=hi,salary_period=per,
    external_apply_url=case when f.external_apply then link else j.external_apply_url end,
    expires_at=case when j.state='live' then expires else j.expires_at end,
    state=case when j.state='live' and not f.auto_publish then 'pending_review'::public.job_state else j.state end
   where j.id=existing and j.state in ('live','pending_review','paused') and (j.title,j.description,j.employment_type,j.arrangement,j.salary_min,j.salary_max,j.salary_period,case when f.external_apply then j.external_apply_url end) is distinct from (trim(item->>'title'),left(item->>'description',30000),item->>'type',item->>'arrangement',lo,hi,per,case when f.external_apply then link end);
   if found then
    delete from public.job_locations where job_id=existing;
    insert into public.job_locations(job_id,label) select existing,left(value,160) from jsonb_array_elements_text(item->'locations');
    updated:=updated+1;
   else
    -- Unchanged roles still in the feed stay listed, and pick up any change to where the role is based.
    update public.jobs j set expires_at=expires where j.id=existing and j.state='live';
    if exists(select 1 from public.jobs j where j.id=existing and j.state in ('live','pending_review','paused'))
     and (select array_agg(l.label order by l.label) from public.job_locations l where l.job_id=existing) is distinct from (select array_agg(x.label order by x.label) from (select left(value,160) as label from jsonb_array_elements_text(item->'locations')) x) then
     delete from public.job_locations where job_id=existing;
     insert into public.job_locations(job_id,label) select existing,left(value,160) from jsonb_array_elements_text(item->'locations');
     updated:=updated+1;
    end if;
   end if;
  end if;
 end loop;
 update public.jobs set state='closed' where id in (select job_id from public.job_feed_items where feed_id=feed and not (external_id=any(seen))) and state in ('live','pending_review','paused');
 get diagnostics closed=row_count;
 update public.job_feeds set last_run_at=now(),last_status=format('%s new, %s updated, %s closed, %s rejected',created,updated,closed,rejected),last_error=null,lease=null,lease_until=null where id=feed;
 return jsonb_build_object('created',created,'updated',updated,'closed',closed,'rejected',rejected);
end $$;

-- The admin overview counts only ABN-checked employers as verified.
create or replace function public.jp_admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  'totals',jsonb_build_object('liveJobs',(select count(*) from public.jobs where state='live' and expires_at>now()),'employers',(select count(*) from public.companies where verified_at is not null and not sourced),
   'seekers',(select count(*) from public.seeker_profiles),'applications7',(select count(*) from public.applications where state<>'draft' and submitted_at>now()-interval '7 days')),
  'daily',(select jsonb_agg(jsonb_build_object('day',d::date,'applications',(select count(*) from public.applications a where a.state<>'draft' and (a.submitted_at at time zone 'Australia/Sydney')::date=d::date),
   'jobs',(select count(*) from public.jobs j where (j.published_at at time zone 'Australia/Sydney')::date=d::date)) order by d) from generate_series(today-13,today,interval '1 day') d));
end $$;

-- Search can be narrowed to roles that state their pay.
drop function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer);
create function public.jp_search_jobs(p_query text default null,p_query_mode text default 'websearch',p_location text default null,p_company text default null,p_arrangement text default null,p_type text default null,
 p_salary_min numeric default null,p_salary_max numeric default null,p_period text default 'year',p_posted_days integer default null,p_near text default null,p_radius_km integer default null,
 p_sort text default 'relevance',p_limit integer default 20,p_offset integer default 0,p_has_pay boolean default null)
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
   and (not coalesce(p_has_pay,false) or j.salary_min is not null)
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
revoke all on function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer,boolean) from public;
grant execute on function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer,boolean) to anon,authenticated,service_role;
commit;
