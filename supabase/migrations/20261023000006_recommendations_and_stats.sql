-- "Jobs for you" from the seeker's own profile, and per-listing funnel statistics for employers.
begin;
create table public.job_view_counts(job_id uuid not null references public.jobs(id) on delete cascade,day date not null default current_date,views integer not null default 0,primary key(job_id,day));
alter table public.job_view_counts enable row level security;
revoke all on public.job_view_counts from anon,authenticated;

-- Counted from the server-rendered job page, which rate-limits per address and skips known crawlers.
create function public.jp_record_job_view(target uuid) returns void language sql security definer set search_path='' as $$
 insert into public.job_view_counts(job_id,day,views) select j.id,current_date,1 from public.jobs j where j.id=target and j.state='live'
 on conflict(job_id,day) do update set views=public.job_view_counts.views+1
$$;
revoke all on function public.jp_record_job_view(uuid) from public;
grant execute on function public.jp_record_job_view(uuid) to anon,authenticated;

create function public.jp_job_stats(company uuid) returns table(job_id uuid,title text,state text,views_30d bigint,applications bigint,apply_rate numeric,interviewing bigint,hired bigint,median_days_to_hire numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (private.is_admin() or exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter'))) then
  raise exception 'Employer access required' using errcode='42501';end if;
 return query
 select j.id,j.title,j.state::text,
  coalesce((select sum(v.views) from public.job_view_counts v where v.job_id=j.id and v.day>current_date-30),0)::bigint,
  (select count(*) from public.applications a where a.job_id=j.id and a.state<>'draft'),
  case when coalesce((select sum(v.views) from public.job_view_counts v where v.job_id=j.id and v.day>current_date-30),0)=0 then null
   else round(100.0*(select count(*) from public.applications a where a.job_id=j.id and a.state<>'draft' and a.submitted_at>now()-interval '30 days')/(select sum(v.views) from public.job_view_counts v where v.job_id=j.id and v.day>current_date-30),1) end,
  (select count(*) from public.applications a where a.job_id=j.id and a.state='submitted' and a.stage in ('interview','offer')),
  (select count(*) from public.applications a where a.job_id=j.id and a.stage='hired'),
  (select round((percentile_cont(.5) within group (order by extract(epoch from h.created_at-a.submitted_at)/86400))::numeric,1)
    from public.applications a join public.application_stage_history h on h.application_id=a.id and h.to_state='hired' where a.job_id=j.id)
 from public.jobs j where j.company_id=company and j.state<>'draft'
 order by j.created_at desc limit 200;
end $$;
revoke all on function public.jp_job_stats(uuid) from public,anon;
grant execute on function public.jp_job_stats(uuid) to authenticated;

-- Matches any profile skill or headline word, prefers roles near the profile location (remote roles always qualify),
-- and leaves out roles already applied to and employers the seeker blocked.
create function public.jp_recommend_jobs(p_limit integer default 10) returns table(job_id uuid,score real,distance_km double precision)
language plpgsql stable security invoker set search_path='' as $$
declare me uuid:=auth.uid(); p public.seeker_profiles%rowtype; q tsquery; lat0 double precision; lng0 double precision;
begin
 if me is null then raise exception 'Sign in to see recommendations' using errcode='42501';end if;
 select * into p from public.seeker_profiles where user_id=me;
 if not found then return;end if;
 select websearch_to_tsquery('english',string_agg(term,' or ')) into q from (select regexp_replace(t,'[^[:alnum:] ]',' ','g') as term from unnest(p.skills||array[p.headline]) t where length(trim(t))>1 limit 25) terms;
 if q is null or q::text='' then return;end if;
 select f.latitude,f.longitude into lat0,lng0 from public.jp_find_place(p.location) f;
 return query
 with scored as (
  select j.id,ts_rank_cd(j.search_vector,q) as r,
   case when lat0 is null then null else (select min(public.jp_distance_km(lat0,lng0,l.latitude,l.longitude)) from public.job_locations l where l.job_id=j.id and l.latitude is not null) end as d,
   j.arrangement,j.published_at
  from public.jobs j join public.companies c on c.id=j.company_id
  where j.state='live' and j.expires_at>now() and c.verified_at is not null and c.suspended_at is null and j.search_vector@@q
   and not exists(select 1 from public.applications a where a.job_id=j.id and a.seeker_id=me)
   and not exists(select 1 from public.company_blocks b where b.seeker_id=me and b.company_id=j.company_id))
 select s.id,(s.r*case when s.arrangement='remote' or s.d<=25 then 1.5 when s.d<=100 then 1.0 else 0.5 end)::real,s.d from scored s
 where lat0 is null or s.arrangement='remote' or s.d<=150
 order by 2 desc,s.published_at desc limit least(greatest(coalesce(p_limit,10),1),30);
end $$;
revoke all on function public.jp_recommend_jobs(integer) from public,anon;
grant execute on function public.jp_recommend_jobs(integer) to authenticated;
commit;
