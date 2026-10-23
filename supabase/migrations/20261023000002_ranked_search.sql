-- Ranked full-text job search, distance search against a gazetteer of Australian places, and a posted-within filter.
begin;
alter table public.jobs add column search_vector tsvector generated always as (
 setweight(to_tsvector('english',coalesce(title,'')),'A')||setweight(to_tsvector('english',coalesce(description,'')),'B')
) stored;
create index jobs_search on public.jobs using gin(search_vector);
create index jobs_live_published on public.jobs(published_at desc) where state='live';

-- Approximate centres of capitals and major regional centres. Load a full postcode gazetteer for wider coverage.
create table public.au_places(name text not null,state text not null check(state in ('VIC','NSW','QLD','WA','SA','TAS','ACT','NT')),latitude double precision not null,longitude double precision not null,primary key(name,state));
alter table public.au_places enable row level security;
revoke all on public.au_places from anon,authenticated;
grant select on public.au_places to anon,authenticated;
create policy places_read on public.au_places for select to anon,authenticated using(true);
insert into public.au_places(name,state,latitude,longitude) values
('Sydney','NSW',-33.8688,151.2093),
('Parramatta','NSW',-33.8150,151.0011),
('Penrith','NSW',-33.7507,150.6877),
('Liverpool','NSW',-33.9200,150.9230),
('Blacktown','NSW',-33.7710,150.9060),
('Chatswood','NSW',-33.7969,151.1803),
('Bondi','NSW',-33.8915,151.2767),
('Newcastle','NSW',-32.9283,151.7817),
('Wollongong','NSW',-34.4278,150.8931),
('Central Coast','NSW',-33.4250,151.3420),
('Gosford','NSW',-33.4250,151.3420),
('Albury','NSW',-36.0737,146.9135),
('Wagga Wagga','NSW',-35.1082,147.3598),
('Dubbo','NSW',-32.2569,148.6011),
('Tamworth','NSW',-31.0927,150.9320),
('Orange','NSW',-33.2840,149.1000),
('Bathurst','NSW',-33.4190,149.5775),
('Port Macquarie','NSW',-31.4333,152.9000),
('Coffs Harbour','NSW',-30.2963,153.1135),
('Lismore','NSW',-28.8133,153.2750),
('Byron Bay','NSW',-28.6474,153.6020),
('Melbourne','VIC',-37.8136,144.9631),
('Southbank','VIC',-37.8230,144.9650),
('Richmond','VIC',-37.8230,144.9980),
('St Kilda','VIC',-37.8676,144.9809),
('Footscray','VIC',-37.8000,144.9000),
('Dandenong','VIC',-37.9875,145.2150),
('Frankston','VIC',-38.1440,145.1260),
('Mornington','VIC',-38.2180,145.0380),
('Box Hill','VIC',-37.8190,145.1220),
('Ringwood','VIC',-37.8150,145.2290),
('Werribee','VIC',-37.9000,144.6600),
('Sunshine','VIC',-37.7880,144.8320),
('Geelong','VIC',-38.1499,144.3617),
('Ballarat','VIC',-37.5622,143.8503),
('Bendigo','VIC',-36.7570,144.2794),
('Shepparton','VIC',-36.3800,145.4000),
('Wodonga','VIC',-36.1218,146.8881),
('Warrnambool','VIC',-38.3818,142.4880),
('Traralgon','VIC',-38.1950,146.5400),
('Mildura','VIC',-34.2080,142.1246),
('Brisbane','QLD',-27.4698,153.0251),
('Fortitude Valley','QLD',-27.4570,153.0340),
('South Brisbane','QLD',-27.4800,153.0200),
('Ipswich','QLD',-27.6144,152.7608),
('Logan','QLD',-27.6390,153.1090),
('Gold Coast','QLD',-28.0167,153.4000),
('Southport','QLD',-27.9670,153.4000),
('Sunshine Coast','QLD',-26.6500,153.0667),
('Maroochydore','QLD',-26.6600,153.0990),
('Toowoomba','QLD',-27.5598,151.9507),
('Cairns','QLD',-16.9186,145.7781),
('Townsville','QLD',-19.2590,146.8169),
('Mackay','QLD',-21.1411,149.1860),
('Rockhampton','QLD',-23.3781,150.5136),
('Bundaberg','QLD',-24.8661,152.3489),
('Hervey Bay','QLD',-25.2882,152.7677),
('Gladstone','QLD',-23.8427,151.2555),
('Perth','WA',-31.9505,115.8605),
('Fremantle','WA',-32.0569,115.7439),
('Joondalup','WA',-31.7448,115.7661),
('Rockingham','WA',-32.2770,115.7300),
('Mandurah','WA',-32.5269,115.7217),
('Bunbury','WA',-33.3271,115.6414),
('Busselton','WA',-33.6550,115.3490),
('Geraldton','WA',-28.7774,114.6150),
('Kalgoorlie','WA',-30.7490,121.4660),
('Karratha','WA',-20.7364,116.8463),
('Port Hedland','WA',-20.3107,118.6060),
('Broome','WA',-17.9614,122.2359),
('Albany','WA',-35.0269,117.8837),
('Adelaide','SA',-34.9285,138.6007),
('Glenelg','SA',-34.9800,138.5150),
('Mount Gambier','SA',-37.8318,140.7792),
('Whyalla','SA',-33.0330,137.5840),
('Port Augusta','SA',-32.4920,137.7650),
('Murray Bridge','SA',-35.1190,139.2730),
('Hobart','TAS',-42.8821,147.3272),
('Launceston','TAS',-41.4332,147.1441),
('Devonport','TAS',-41.1770,146.3510),
('Burnie','TAS',-41.0520,145.9060),
('Canberra','ACT',-35.2809,149.1300),
('Belconnen','ACT',-35.2380,149.0660),
('Tuggeranong','ACT',-35.4150,149.0670),
('Queanbeyan','NSW',-35.3533,149.2342),
('Darwin','NT',-12.4634,130.8456),
('Palmerston','NT',-12.4860,130.9830),
('Alice Springs','NT',-23.6980,133.8807),
('Katherine','NT',-14.4650,132.2640)
;

-- "Frankston VIC 3199" -> Frankston/VIC. A label with only a state resolves to nothing.
create function public.jp_find_place(label text) returns table(name text,state text,latitude double precision,longitude double precision)
language sql stable security invoker set search_path='' as $$
 with parts as (select upper(coalesce(substring(label from '\m(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\M'),'')) as st,
  lower(trim(regexp_replace(regexp_replace(label,'\m(VIC|NSW|QLD|WA|SA|TAS|ACT|NT|Vic|Nsw|Qld|Tas|Australia)\M|\d{4}|,',' ','gi'),'\s+',' ','g'))) as nm)
 select p.name,p.state,p.latitude,p.longitude from public.au_places p,parts
 where parts.nm<>'' and lower(p.name)=parts.nm and (parts.st='' or p.state=parts.st)
 order by p.state limit 1
$$;
grant execute on function public.jp_find_place(text) to anon,authenticated;

create function private.geocode_location() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.latitude is null or new.longitude is null then
  select p.latitude,p.longitude into new.latitude,new.longitude from public.jp_find_place(new.label) p;
 end if;
 return new;
end $$;
revoke all on function private.geocode_location() from public,anon,authenticated;
create trigger job_location_geocode before insert or update of label on public.job_locations for each row execute function private.geocode_location();
update public.job_locations l set (latitude,longitude)=(select p.latitude,p.longitude from public.jp_find_place(l.label) p) where l.latitude is null and exists(select 1 from public.jp_find_place(l.label));

create function public.jp_distance_km(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision) returns double precision
language sql immutable set search_path='' as $$
 select 6371*2*asin(sqrt(power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)))
$$;
grant execute on function public.jp_distance_km(double precision,double precision,double precision,double precision) to anon,authenticated;

-- Runs with the caller's rights, so row-level security still decides which jobs exist.
create function public.jp_search_jobs(p_query text default null,p_query_mode text default 'websearch',p_location text default null,p_company text default null,p_arrangement text default null,p_type text default null,
 p_salary_min numeric default null,p_salary_max numeric default null,p_period text default 'year',p_posted_days integer default null,p_near text default null,p_radius_km integer default null,
 p_sort text default 'relevance',p_limit integer default 20,p_offset integer default 0)
returns table(job_id uuid,rank real,distance_km double precision,total_count bigint)
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
  select j.id,j.published_at,j.salary_min,
   case when q is null then 0::real else ts_rank_cd(j.search_vector,q) end as r,
   case when lat0 is null then null else (select min(public.jp_distance_km(lat0,lng0,l.latitude,l.longitude)) from public.job_locations l where l.job_id=j.id and l.latitude is not null) end as d
  from public.jobs j join public.companies c on c.id=j.company_id
  where j.state='live' and j.expires_at>now()
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
 select m.id,m.r,m.d,count(*) over() from matches m
 where lat0 is null or (m.d is not null and m.d<=coalesce(p_radius_km,25))
 order by
  case when p_sort='salary' then m.salary_min end desc nulls last,
  case when p_sort='distance' then m.d end asc nulls last,
  case when p_sort='relevance' and q is not null then m.r end desc nulls last,
  m.published_at desc,m.id
 limit least(greatest(coalesce(p_limit,20),1),50) offset greatest(coalesce(p_offset,0),0);
end $$;
revoke all on function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer) from public;
grant execute on function public.jp_search_jobs(text,text,text,text,text,text,numeric,numeric,text,integer,text,integer,text,integer,integer) to anon,authenticated,service_role;

-- Saved searches accept the new filters.
create or replace function private.launch_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; report public.job_reports%rowtype; search_filters jsonb; k text; review_reason text;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid payload' using errcode='22023';end if;
 -- Serialise per-user quotas to avoid concurrent-request bypass.
 perform 1 from auth.users where id=actor for update;
 case action
 when 'search.save' then
  search_filters:=payload->'filters';
  if jsonb_typeof(search_filters) is distinct from 'object' or length(search_filters::text)>2000 then raise exception 'Invalid search' using errcode='22023';end if;
  for k in select jsonb_object_keys(search_filters) loop
   if k not in ('q','location','company','arrangement','type','sort','salaryMin','salaryMax','salaryPeriod','posted','near','radius','sector') or jsonb_typeof(search_filters->k)<>'string' or length(search_filters->>k)>120 then raise exception 'Invalid search field' using errcode='22023';end if;
  end loop;
  if (select count(*) from public.saved_searches where user_id=actor)>=20 then raise exception 'You can save up to 20 searches' using errcode='22023';end if;
  select id into target from public.saved_searches where user_id=actor and saved_searches.filters=search_filters limit 1;
  if target is null then insert into public.saved_searches(user_id,filters,frequency) values(actor,search_filters,'off') returning id into target;end if;
  return jsonb_build_object('id',target);
 when 'search.delete' then
  delete from public.saved_searches where id=(payload->>'id')::uuid and user_id=actor;
  return jsonb_build_object('ok',true);
 when 'job.report' then
  target:=(payload->>'jobId')::uuid;review_reason:=trim(payload->>'reason');
  if review_reason is null or length(review_reason) not between 10 and 2000 then raise exception 'Describe the issue in 10 to 2000 characters' using errcode='22023';end if;
  if not exists(select 1 from public.jobs j join public.companies c on c.id=j.company_id where j.id=target and j.state='live' and j.expires_at>now() and c.verified_at is not null and c.suspended_at is null) then raise exception 'Job is no longer available' using errcode='22023';end if;
  if exists(select 1 from public.job_reports where job_id=target and reporter_id=actor and state='open') then raise exception 'Your report is already awaiting review' using errcode='22023';end if;
  if (select count(*) from public.job_reports where reporter_id=actor and created_at>now()-interval '1 day')>=10 then raise exception 'Daily report limit reached' using errcode='22023';end if;
  insert into public.job_reports(job_id,reporter_id,reason) values(target,actor,review_reason) returning id into target;
  return jsonb_build_object('id',target);
 when 'report.resolve' then
  if not private.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
  review_reason:=trim(payload->>'reason');
  if review_reason is null or length(review_reason) not between 10 and 2000 then raise exception 'Record a review reason' using errcode='22023';end if;
  select * into report from public.job_reports where id=(payload->>'id')::uuid for update;
  if not found or report.state<>'open' then raise exception 'Report is not open' using errcode='22023';end if;
  if payload->>'pause'='true' then update public.jobs set state='paused' where id=report.job_id and state='live';end if;
  update public.job_reports set state='resolved',resolution=review_reason,reviewed_by=actor,reviewed_at=now() where id=report.id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,case when payload->>'pause'='true' then 'report.resolved.pause' else 'report.resolved' end,'job',report.job_id,review_reason);
  return jsonb_build_object('ok',true);
 else raise exception 'Unknown command' using errcode='22023';
 end case;
end;$$;
revoke all on function private.launch_command(text,jsonb) from public,anon,authenticated;
grant execute on function private.launch_command(text,jsonb) to authenticated;
commit;
