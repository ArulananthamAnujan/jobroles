-- Community content on company pages: workplace reviews from current and former staff, interview experiences,
-- self-reported salaries and company questions and answers. Authors stay anonymous; text is moderated before it
-- appears, and salaries only appear as aggregates of at least three reports.
begin;

-- Workplace reviews share the reviews table with hiring-experience reviews -------------------------------------
alter table public.company_reviews add column kind text not null default 'hiring' check(kind in ('hiring','workplace')),
 add column job_title text check(job_title is null or length(job_title) between 2 and 120),
 add column employment_status text check(employment_status is null or employment_status in ('current','former')),
 add column work_location text check(work_location is null or length(work_location)<=120),
 add column rating_worklife smallint check(rating_worklife between 1 and 5),add column rating_pay smallint check(rating_pay between 1 and 5),
 add column rating_security smallint check(rating_security between 1 and 5),add column rating_management smallint check(rating_management between 1 and 5),
 add column rating_culture smallint check(rating_culture between 1 and 5),add column recommends boolean;
alter table public.company_reviews drop constraint company_reviews_company_id_author_id_key;
alter table public.company_reviews add constraint company_reviews_company_author_kind unique(company_id,author_id,kind);
grant select(kind,job_title,employment_status,work_location,rating_worklife,rating_pay,rating_security,rating_management,rating_culture,recommends) on public.company_reviews to anon,authenticated;

create or replace function public.jp_submit_review(company uuid,stars integer,headline text,good text,bad text,communication integer default null,fairness integer default null,speed integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where j.company_id=company and a.seeker_id=actor and a.state<>'draft') then raise exception 'Only people who applied to this employer can review its hiring process' using errcode='42501';end if;
 if exists(select 1 from public.company_memberships where company_id=company and user_id=actor) then raise exception 'Employer team members cannot review their own company' using errcode='42501';end if;
 if stars not between 1 and 5 or length(trim(coalesce(headline,''))) not between 3 and 120 or length(trim(coalesce(good,''))) not between 10 and 2000 or length(trim(coalesce(bad,''))) not between 10 and 2000
  or coalesce(communication,3) not between 1 and 5 or coalesce(fairness,3) not between 1 and 5 or coalesce(speed,3) not between 1 and 5 then
  raise exception 'Give 1 to 5 stars, a title, and at least 10 characters for what went well and what could improve' using errcode='22023';end if;
 insert into public.company_reviews(company_id,author_id,kind,rating,title,pros,cons,rating_communication,rating_fairness,rating_speed) values(company,actor,'hiring',stars,trim(headline),trim(good),trim(bad),communication,fairness,speed)
 on conflict(company_id,author_id,kind) do update set rating=excluded.rating,title=excluded.title,pros=excluded.pros,cons=excluded.cons,rating_communication=excluded.rating_communication,rating_fairness=excluded.rating_fairness,rating_speed=excluded.rating_speed,status='pending',moderation_reason=null,published_at=null,created_at=now()
 returning id into target;
 return jsonb_build_object('id',target,'status','pending');
end $$;

-- Anyone with a confirmed account who is not on the employer's team may describe working there.
create function public.jp_submit_workplace_review(company uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; r int:=(payload->>'rating')::int;
 cats int[]:=array[(payload->>'worklife')::int,(payload->>'pay')::int,(payload->>'security')::int,(payload->>'management')::int,(payload->>'culture')::int];
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if not exists(select 1 from public.companies where id=company and verified_at is not null and suspended_at is null) then raise exception 'Company not available' using errcode='22023';end if;
 if exists(select 1 from public.company_memberships where company_id=company and user_id=actor) then raise exception 'Employer team members cannot review their own company' using errcode='42501';end if;
 if r is null or r not between 1 and 5 or exists(select 1 from unnest(cats) c where c is not null and c not between 1 and 5)
  or length(trim(coalesce(payload->>'title',''))) not between 3 and 120 or length(trim(coalesce(payload->>'pros',''))) not between 10 and 2000 or length(trim(coalesce(payload->>'cons',''))) not between 10 and 2000
  or length(trim(coalesce(payload->>'jobTitle',''))) not between 2 and 120 or coalesce(payload->>'status','') not in ('current','former') then
  raise exception 'Give a rating, your job title, whether you still work there, a title, and at least 10 characters for the pros and cons' using errcode='22023';end if;
 insert into public.company_reviews(company_id,author_id,kind,rating,title,pros,cons,job_title,employment_status,work_location,rating_worklife,rating_pay,rating_security,rating_management,rating_culture,recommends)
 values(company,actor,'workplace',r,trim(payload->>'title'),trim(payload->>'pros'),trim(payload->>'cons'),trim(payload->>'jobTitle'),payload->>'status',nullif(left(trim(coalesce(payload->>'location','')),120),''),cats[1],cats[2],cats[3],cats[4],cats[5],(payload->>'recommends')::boolean)
 on conflict(company_id,author_id,kind) do update set rating=excluded.rating,title=excluded.title,pros=excluded.pros,cons=excluded.cons,job_title=excluded.job_title,employment_status=excluded.employment_status,work_location=excluded.work_location,
  rating_worklife=excluded.rating_worklife,rating_pay=excluded.rating_pay,rating_security=excluded.rating_security,rating_management=excluded.rating_management,rating_culture=excluded.rating_culture,recommends=excluded.recommends,
  status='pending',moderation_reason=null,published_at=null,created_at=now()
 returning id into target;
 return jsonb_build_object('id',target,'status','pending');
end $$;

create or replace function public.jp_company_rating(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then null else jsonb_build_object('average',round(avg(rating),1),'count',count(*),
  'distribution',jsonb_build_object('5',count(*) filter(where rating=5),'4',count(*) filter(where rating=4),'3',count(*) filter(where rating=3),'2',count(*) filter(where rating=2),'1',count(*) filter(where rating=1)),
  'communication',round(avg(rating_communication),1),'fairness',round(avg(rating_fairness),1),'speed',round(avg(rating_speed),1)) end
 from public.company_reviews where company_id=company and status='published' and kind='hiring'
$$;
create function public.jp_workplace_rating(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then null else jsonb_build_object('average',round(avg(rating),1),'count',count(*),
  'distribution',jsonb_build_object('5',count(*) filter(where rating=5),'4',count(*) filter(where rating=4),'3',count(*) filter(where rating=3),'2',count(*) filter(where rating=2),'1',count(*) filter(where rating=1)),
  'worklife',round(avg(rating_worklife),1),'pay',round(avg(rating_pay),1),'security',round(avg(rating_security),1),'management',round(avg(rating_management),1),'culture',round(avg(rating_culture),1),
  'recommend',case when count(recommends)=0 then null else round(100.0*count(*) filter(where recommends)/count(recommends)) end) end
 from public.company_reviews where company_id=company and status='published' and kind='workplace'
$$;
drop function public.jp_pending_reviews();
create function public.jp_pending_reviews() returns table(id uuid,company_id uuid,company_name text,kind text,job_title text,rating smallint,title text,pros text,cons text,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return query select r.id,r.company_id,c.name,r.kind,r.job_title,r.rating,r.title,r.pros,r.cons,r.created_at from public.company_reviews r join public.companies c on c.id=r.company_id where r.status='pending' order by r.created_at limit 100;
end $$;

-- Interview experiences ----------------------------------------------------------------------------------------
create table public.company_interviews(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,author_id uuid not null references auth.users(id) on delete cascade,
 job_title text not null check(length(job_title) between 2 and 120),experience text not null check(experience in ('positive','neutral','negative')),
 difficulty smallint not null check(difficulty between 1 and 5),outcome text not null check(outcome in ('offer_accepted','offer_declined','no_offer','waiting')),
 source text check(source is null or source in ('applied_online','recruiter','referral','other')),duration text check(duration is null or duration in ('days','1-2 weeks','3-4 weeks','1-2 months','longer')),
 process text not null check(length(process) between 30 and 3000),questions text[] not null default '{}' check(cardinality(questions)<=10),
 status text not null default 'pending' check(status in ('pending','published','rejected')),moderation_reason text,
 helpful_count integer not null default 0,interviewed_on date,created_at timestamptz not null default now(),published_at timestamptz,unique(company_id,author_id,job_title)
);
alter table public.company_interviews enable row level security;
revoke all on public.company_interviews from anon,authenticated;
grant select(id,company_id,job_title,experience,difficulty,outcome,source,duration,process,questions,status,helpful_count,interviewed_on,published_at) on public.company_interviews to anon,authenticated;
create policy interviews_public on public.company_interviews for select to anon,authenticated using(status='published');
create function public.jp_submit_interview(company uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; qs text[];
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if not exists(select 1 from public.companies where id=company and verified_at is not null and suspended_at is null) then raise exception 'Company not available' using errcode='22023';end if;
 if exists(select 1 from public.company_memberships where company_id=company and user_id=actor) then raise exception 'Employer team members cannot post about their own company' using errcode='42501';end if;
 select coalesce(array_agg(trim(q)),'{}') into qs from jsonb_array_elements_text(coalesce(payload->'questions','[]'::jsonb)) q where length(trim(q))>0;
 if cardinality(qs)>10 or exists(select 1 from unnest(qs) q where length(q) not between 5 and 300) then raise exception 'Add up to 10 questions of 5 to 300 characters' using errcode='22023';end if;
 if length(trim(coalesce(payload->>'jobTitle',''))) not between 2 and 120 or coalesce(payload->>'experience','') not in ('positive','neutral','negative') or coalesce((payload->>'difficulty')::int,0) not between 1 and 5
  or coalesce(payload->>'outcome','') not in ('offer_accepted','offer_declined','no_offer','waiting') or length(trim(coalesce(payload->>'process',''))) not between 30 and 3000 then
  raise exception 'Give the job title, how it went, the difficulty, the outcome and at least 30 characters about the process' using errcode='22023';end if;
 insert into public.company_interviews(company_id,author_id,job_title,experience,difficulty,outcome,source,duration,process,questions,interviewed_on)
 values(company,actor,trim(payload->>'jobTitle'),payload->>'experience',(payload->>'difficulty')::int,payload->>'outcome',
  case when payload->>'source' in ('applied_online','recruiter','referral','other') then payload->>'source' end,
  case when payload->>'duration' in ('days','1-2 weeks','3-4 weeks','1-2 months','longer') then payload->>'duration' end,trim(payload->>'process'),qs,
  case when coalesce(payload->>'month','') ~ '^\d{4}-\d{2}$' then least(to_date(payload->>'month','YYYY-MM'),current_date) end)
 on conflict(company_id,author_id,job_title) do update set experience=excluded.experience,difficulty=excluded.difficulty,outcome=excluded.outcome,source=excluded.source,duration=excluded.duration,
  process=excluded.process,questions=excluded.questions,interviewed_on=excluded.interviewed_on,status='pending',moderation_reason=null,published_at=null,created_at=now()
 returning id into target;
 return jsonb_build_object('id',target,'status','pending');
end $$;
create function public.jp_interview_summary(company uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then null else jsonb_build_object('count',count(*),'difficulty',round(avg(difficulty),1),
  'positive',round(100.0*count(*) filter(where experience='positive')/count(*)),'neutral',round(100.0*count(*) filter(where experience='neutral')/count(*)),'negative',round(100.0*count(*) filter(where experience='negative')/count(*)),
  'offers',round(100.0*count(*) filter(where outcome in ('offer_accepted','offer_declined'))/count(*))) end
 from public.company_interviews where company_id=company and status='published'
$$;

-- Self-reported salaries ---------------------------------------------------------------------------------------
create table public.salary_reports(
 id uuid primary key default gen_random_uuid(),company_id uuid references public.companies(id) on delete cascade,author_id uuid not null references auth.users(id) on delete cascade,
 job_title text not null check(length(job_title) between 2 and 120),title_key text generated always as (lower(regexp_replace(trim(job_title),'\s+',' ','g'))) stored,
 location text check(location is null or length(location)<=120),pay numeric(12,2) not null,period text not null check(period in ('hour','day','month','year')),
 employment_type text check(employment_type is null or employment_type in ('Full-time','Part-time','Casual','Contract')),experience text check(experience is null or experience in ('0-1','1-3','3-5','5-10','10+')),
 created_at timestamptz not null default now(),
 check(case period when 'hour' then pay between 15 and 500 when 'day' then pay between 100 and 4000 when 'month' then pay between 1500 and 80000 else pay between 25000 and 1000000 end)
);
create unique index salary_reports_one on public.salary_reports(author_id,coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid),title_key);
create index salary_reports_title on public.salary_reports(title_key,period);
alter table public.salary_reports enable row level security;
revoke all on public.salary_reports from anon,authenticated;
create function public.jp_report_salary(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid:=nullif(payload->>'companyId','')::uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if company is not null and not exists(select 1 from public.companies where id=company and verified_at is not null) then raise exception 'Company not available' using errcode='22023';end if;
 if (select count(*) from public.salary_reports where author_id=actor and created_at>now()-interval '1 day')>=10 then raise exception 'You can add up to 10 salaries a day' using errcode='22023';end if;
 begin
  insert into public.salary_reports(company_id,author_id,job_title,location,pay,period,employment_type,experience)
  values(company,actor,trim(payload->>'jobTitle'),nullif(left(trim(coalesce(payload->>'location','')),120),''),(payload->>'pay')::numeric,payload->>'period',
   case when payload->>'type' in ('Full-time','Part-time','Casual','Contract') then payload->>'type' end,case when payload->>'experience' in ('0-1','1-3','3-5','5-10','10+') then payload->>'experience' end)
  on conflict(author_id,coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid),title_key) do update set pay=excluded.pay,period=excluded.period,location=excluded.location,employment_type=excluded.employment_type,experience=excluded.experience,created_at=now();
 exception when check_violation or invalid_text_representation or not_null_violation then
  raise exception 'Give a job title and a realistic pay amount for the period you chose' using errcode='22023';
 end;
 return jsonb_build_object('ok',true);
end $$;
-- Reported pay for one company, per title and period, only where at least three people reported.
create function public.jp_company_reported_salaries(company uuid) returns table(job_title text,period text,reports bigint,low numeric,median numeric,high numeric)
language sql stable security definer set search_path='' as $$
 select min(job_title),period,count(*),min(pay),percentile_cont(.5) within group(order by pay)::numeric,max(pay) from public.salary_reports
 where company_id=company group by title_key,period having count(*)>=3 order by count(*) desc limit 100
$$;
-- Pay for a job title across Australia: reported salaries (three or more) and advertised ranges from live jobs.
create function public.jp_salary_lookup(title text,place text default null) returns jsonb language sql stable security definer set search_path='' as $$
 with wanted as (select lower(regexp_replace(trim(title),'\s+',' ','g')) as k,nullif(trim(coalesce(place,'')),'') as p),
 reported as (select s.period,count(*) n,min(s.pay) lo,percentile_cont(.5) within group(order by s.pay) med,max(s.pay) hi from public.salary_reports s,wanted w
  where s.title_key=w.k and (w.p is null or s.location ilike '%'||w.p||'%') group by s.period having count(*)>=3),
 advertised as (select j.salary_period period,count(*) n,min(j.salary_min) lo,percentile_cont(.5) within group(order by (j.salary_min+j.salary_max)/2) med,max(j.salary_max) hi
  from public.jobs j,wanted w where j.state='live' and j.expires_at>now() and j.salary_min is not null and j.salary_max is not null and lower(j.title) like '%'||replace(replace(w.k,'%','\%'),'_','\_')||'%'
  and (w.p is null or exists(select 1 from public.job_locations l where l.job_id=j.id and l.label ilike '%'||w.p||'%')) group by j.salary_period),
 companies as (select c.id,c.name,count(*) n,percentile_cont(.5) within group(order by (j.salary_min+j.salary_max)/2) med,min(j.salary_period) period from public.jobs j join public.companies c on c.id=j.company_id,wanted w
  where j.state='live' and j.expires_at>now() and j.salary_min is not null and lower(j.title) like '%'||replace(replace(w.k,'%','\%'),'_','\_')||'%' and j.salary_period='year' group by c.id,c.name order by 4 desc limit 10)
 select jsonb_build_object('reported',coalesce((select jsonb_agg(to_jsonb(r)) from reported r),'[]'),'advertised',coalesce((select jsonb_agg(to_jsonb(a)) from advertised a),'[]'),
  'topPaying',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'jobs',n,'median',med)) from companies),'[]'))
$$;

-- Questions and answers ----------------------------------------------------------------------------------------
create table public.company_questions(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(body) between 10 and 300),status text not null default 'pending' check(status in ('pending','published','rejected')),moderation_reason text,
 created_at timestamptz not null default now(),published_at timestamptz
);
create table public.company_answers(
 id uuid primary key default gen_random_uuid(),question_id uuid not null references public.company_questions(id) on delete cascade,author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(body) between 10 and 1500),from_employer boolean not null default false,status text not null default 'pending' check(status in ('pending','published','rejected')),moderation_reason text,
 created_at timestamptz not null default now(),published_at timestamptz,unique(question_id,author_id)
);
alter table public.company_questions enable row level security;alter table public.company_answers enable row level security;
revoke all on public.company_questions,public.company_answers from anon,authenticated;
grant select(id,company_id,body,status,published_at) on public.company_questions to anon,authenticated;
grant select(id,question_id,body,from_employer,status,published_at) on public.company_answers to anon,authenticated;
create policy questions_public on public.company_questions for select to anon,authenticated using(status='published');
create policy answers_public on public.company_answers for select to anon,authenticated using(status='published');
create function public.jp_ask_question(company uuid,question text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if not exists(select 1 from public.companies where id=company and verified_at is not null and suspended_at is null) then raise exception 'Company not available' using errcode='22023';end if;
 if length(trim(coalesce(question,''))) not between 10 and 300 then raise exception 'Ask a question of 10 to 300 characters' using errcode='22023';end if;
 if (select count(*) from public.company_questions where author_id=actor and created_at>now()-interval '1 day')>=5 then raise exception 'You can ask up to 5 questions a day' using errcode='22023';end if;
 insert into public.company_questions(company_id,author_id,body) values(company,actor,trim(question)) returning id into target;
 return jsonb_build_object('id',target,'status','pending');
end $$;
-- Owners and recruiters answer as the employer and are published at once; anyone else is moderated.
create function public.jp_answer_question(target uuid,answer text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q public.company_questions%rowtype; employer boolean;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 select * into q from public.company_questions where id=target and status='published';
 if not found then raise exception 'Question not available' using errcode='22023';end if;
 if q.author_id=actor then raise exception 'You cannot answer your own question' using errcode='22023';end if;
 if length(trim(coalesce(answer,''))) not between 10 and 1500 then raise exception 'Write an answer of 10 to 1500 characters' using errcode='22023';end if;
 employer:=exists(select 1 from public.company_memberships where company_id=q.company_id and user_id=actor and role in ('owner','recruiter'));
 insert into public.company_answers(question_id,author_id,body,from_employer,status,published_at) values(target,actor,trim(answer),employer,case when employer then 'published' else 'pending' end,case when employer then now() end)
 on conflict(question_id,author_id) do update set body=excluded.body,from_employer=excluded.from_employer,status=excluded.status,published_at=excluded.published_at,moderation_reason=null,created_at=now();
 return jsonb_build_object('status',case when employer then 'published' else 'pending' end);
end $$;

-- One moderation queue for interviews, questions and answers ---------------------------------------------------
create function public.jp_pending_community() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x->>'createdAt') from (
  select jsonb_build_object('kind','interview','id',i.id,'company',c.name,'title',i.job_title||' interview','body',i.process,'extra',array_to_string(i.questions,' · '),'createdAt',i.created_at) x from public.company_interviews i join public.companies c on c.id=i.company_id where i.status='pending'
  union all select jsonb_build_object('kind','question','id',q.id,'company',c.name,'title','Question','body',q.body,'extra','','createdAt',q.created_at) from public.company_questions q join public.companies c on c.id=q.company_id where q.status='pending'
  union all select jsonb_build_object('kind','answer','id',a.id,'company',c.name,'title','Answer to: '||q.body,'body',a.body,'extra','','createdAt',a.created_at) from public.company_answers a join public.company_questions q on q.id=a.question_id join public.companies c on c.id=q.company_id where a.status='pending'
  limit 200) s),'[]'::jsonb);
end $$;
create function public.jp_moderate_community(kind text,target uuid,decision text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare next_status text:=case when decision='publish' then 'published' else 'rejected' end;
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if decision not in ('publish','reject') or length(trim(coalesce(reason,'')))<3 or kind not in ('interview','question','answer') then raise exception 'Choose publish or reject and record a reason' using errcode='22023';end if;
 if kind='interview' then update public.company_interviews set status=next_status,moderation_reason=trim(reason),published_at=case when decision='publish' then now() end where id=target and status='pending';
 elsif kind='question' then update public.company_questions set status=next_status,moderation_reason=trim(reason),published_at=case when decision='publish' then now() end where id=target and status='pending';
 else update public.company_answers set status=next_status,moderation_reason=trim(reason),published_at=case when decision='publish' then now() end where id=target and status='pending';end if;
 if not found then raise exception 'Not awaiting moderation' using errcode='22023';end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),kind||'.'||decision,'company_'||kind,target,trim(reason));
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.jp_submit_workplace_review(uuid,jsonb),public.jp_pending_reviews(),public.jp_submit_interview(uuid,jsonb),public.jp_report_salary(jsonb),public.jp_ask_question(uuid,text),
 public.jp_answer_question(uuid,text),public.jp_pending_community(),public.jp_moderate_community(text,uuid,text,text) from public,anon;
grant execute on function public.jp_submit_workplace_review(uuid,jsonb),public.jp_pending_reviews(),public.jp_submit_interview(uuid,jsonb),public.jp_report_salary(jsonb),public.jp_ask_question(uuid,text),
 public.jp_answer_question(uuid,text),public.jp_pending_community(),public.jp_moderate_community(text,uuid,text,text) to authenticated;
grant execute on function public.jp_workplace_rating(uuid),public.jp_interview_summary(uuid),public.jp_company_reported_salaries(uuid),public.jp_salary_lookup(text,text) to anon,authenticated;
commit;
