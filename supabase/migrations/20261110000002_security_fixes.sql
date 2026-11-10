-- Fixes from the November 2026 security review.
begin;

-- 1. Resume autofill sends the person's resume to a paid AI service. The only limit was held in the web server's
--    memory, which serverless hosting resets and does not share, so one account could run up unlimited cost.
--    This is a durable allowance: five reads a day per confirmed account.
create table private.resume_ai_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 usage_day date not null, attempts integer not null check (attempts between 1 and 5)
);
alter table private.resume_ai_usage enable row level security;
revoke all on private.resume_ai_usage from public,anon,authenticated;
create function public.jp_resume_ai_quota() returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); today date:=(now() at time zone 'Australia/Sydney')::date; accepted uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
  raise exception 'Confirmed account required' using errcode='42501';
 end if;
 insert into private.resume_ai_usage(user_id,usage_day,attempts) values(actor,today,1)
 on conflict(user_id) do update set usage_day=today,
  attempts=case when resume_ai_usage.usage_day=today then resume_ai_usage.attempts+1 else 1 end
 where resume_ai_usage.usage_day<>today or resume_ai_usage.attempts<5
 returning user_id into accepted;
 return accepted is not null;
end $$;
revoke all on function public.jp_resume_ai_quota() from public,anon;
grant execute on function public.jp_resume_ai_quota() to authenticated;

-- 2. Saving a push subscription took over an existing one with the same endpoint, whoever owned it. Someone who
--    learned another person's endpoint address could have redirected that person's alerts to their own account.
--    A subscription now changes hands only when the caller also presents its existing keys, which only the same
--    browser has (the case of two people sharing one device).
create or replace function public.jp_save_push(p_endpoint text,p_p256dh text,p_auth text) returns boolean language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to turn on notifications' using errcode='42501';end if;
 if (select count(*) from public.push_subscriptions where user_id=auth.uid())>=10 then delete from public.push_subscriptions where id=(select id from public.push_subscriptions where user_id=auth.uid() order by created_at limit 1);end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=now()
 where push_subscriptions.user_id=excluded.user_id or (push_subscriptions.p256dh=excluded.p256dh and push_subscriptions.auth=excluded.auth)
 returning id into saved;
 if saved is null then raise exception 'This device is registered to another account' using errcode='42501';end if;
 return true;
end $$;

-- 3. Someone removed from a company's team could still answer questions on its public page as "the employer",
--    published without moderation. The membership check now ignores revoked memberships.
create or replace function public.jp_answer_question(target uuid,answer text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); q public.company_questions%rowtype; employer boolean;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 select * into q from public.company_questions where id=target and status='published';
 if not found then raise exception 'Question not available' using errcode='22023';end if;
 if q.author_id=actor then raise exception 'You cannot answer your own question' using errcode='22023';end if;
 if length(trim(coalesce(answer,''))) not between 10 and 1500 then raise exception 'Write an answer of 10 to 1500 characters' using errcode='22023';end if;
 employer:=exists(select 1 from public.company_memberships where company_id=q.company_id and user_id=actor and role in ('owner','recruiter') and revoked_at is null);
 insert into public.company_answers(question_id,author_id,body,from_employer,status,published_at) values(target,actor,trim(answer),employer,case when employer then 'published' else 'pending' end,case when employer then now() end)
 on conflict(question_id,author_id) do update set body=excluded.body,from_employer=excluded.from_employer,status=excluded.status,published_at=excluded.published_at,moderation_reason=null,created_at=now();
 return jsonb_build_object('status',case when employer then 'published' else 'pending' end);
end $$;

-- 4. A company's logo, cover and photos must be files in its own folder of the company-media bucket. The check only
--    looked for that folder name somewhere in the address, so an owner could point the public page at an image on any
--    other website (for example to track visitors). The address must now be exactly a file in the folder, on the
--    Supabase project's own host. Projects on a custom domain set it once:
--    insert into private.settings(key,value) values('media_host','"files.example.com"');
create or replace function private.media_url_ok(company uuid,url text) returns boolean language sql stable set search_path='' as $$
 select url is null or coalesce(length(url)<=500 and position('..' in url)=0
  and url ~ ('^https://[A-Za-z0-9.-]+/storage/v1/object/public/company-media/'||company::text||'/[A-Za-z0-9._/-]+$')
  and (substring(url from '^https://([A-Za-z0-9.-]+)/') ~ '^[a-z0-9-]+\.supabase\.(co|in)$'
   -- coalesce: with no custom host set the comparison is null, and a null result must count as a refusal.
   or coalesce(substring(url from '^https://([A-Za-z0-9.-]+)/')=(private.setting('media_host')#>>'{}'),false)),false)
$$;

-- 5. Screening questions and benefits are shown on the public listing, but changing them on a live role did not send
--    it back to review, unlike every other edit. A team member could add unreviewed text (a phone number, a fee) to
--    an approved listing.
create or replace function public.jp_set_screening(target uuid,questions jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; n integer:=0; before text[]; after text[];
begin
 if not private.job_permission(target,'edit') then raise exception 'Job access denied' using errcode='42501';end if;
 if exists(select 1 from public.applications where job_id=target and state<>'draft') then raise exception 'Screening questions are fixed once people have applied' using errcode='22023';end if;
 if jsonb_typeof(questions)<>'array' or jsonb_array_length(questions) not between 1 and 10 then raise exception 'Add between 1 and 10 questions' using errcode='22023';end if;
 for q in select * from jsonb_array_elements(questions) loop
  if length(trim(coalesce(q->>'question',''))) not between 5 and 300 or coalesce(q->>'expected','Yes') not in ('Yes','No') then raise exception 'Each question needs 5 to 300 characters' using errcode='22023';end if;
 end loop;
 before:=array(select question from public.screening_questions where job_id=target order by position,id);
 after:=array(select trim(x->>'question') from jsonb_array_elements(questions) with ordinality as t(x,o) order by o);
 delete from public.screening_questions where job_id=target;
 for q in select * from jsonb_array_elements(questions) loop
  insert into public.screening_questions(job_id,question,required,must_have,expected_answer,position) values(target,trim(q->>'question'),true,coalesce((q->>'mustHave')::boolean,false),coalesce(q->>'expected','Yes'),n);n:=n+1;
 end loop;
 -- New wording on a live role is public straight away, so it goes back to review like any other edit.
 if before is distinct from after then update public.jobs set state='pending_review' where id=target and state='live';end if;
 return jsonb_build_object('count',n);
end $$;

create or replace function public.jp_job_extras(target uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype; b text[]:=array(select left(trim(x),80) from jsonb_array_elements_text(coalesce(payload->'benefits','[]')) x where trim(x)<>'' limit 20); url text:=nullif(trim(coalesce(payload->>'externalApplyUrl','')),'');
begin
 select * into j from public.jobs where id=target for update;
 if not found or not private.job_permission(target,'edit') then raise exception 'Job access denied' using errcode='42501';end if;
 if url is not null and (url !~ '^https://' or length(url)>500) then raise exception 'The application link must start with https://' using errcode='22023';end if;
 -- A changed apply link on a live role goes back to review, like any other edit.
 update public.jobs set benefits=b,start_date=nullif(payload->>'startDate','')::date,external_apply_url=url,
  state=case when j.state='live' and (url is distinct from j.external_apply_url or b is distinct from j.benefits) then 'pending_review'::public.job_state else j.state end where id=target;
 return jsonb_build_object('ok',true);
end $$;

-- 6. The daily limit on support requests counted by the email typed into the form, so a stranger could use up
--    someone else's allowance. Signed-in people are now counted by their account only.
create or replace function public.jp_submit_ticket(contact text,full_name text,topic text,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; mail text:=coalesce((select email from auth.users where id=auth.uid()),trim(contact));
begin
 if (select count(*) from public.support_tickets t where (case when auth.uid() is null then t.user_id is null and t.email=mail else t.user_id=auth.uid() end) and t.created_at>now()-interval '1 day')>=5 then raise exception 'You have sent several requests today. We will reply to those first' using errcode='22023';end if;
 begin
  insert into public.support_tickets(user_id,email,name,topic,message) values(auth.uid(),mail,nullif(left(trim(coalesce(full_name,'')),120),''),topic,trim(body)) returning id into target;
 exception when check_violation or not_null_violation then raise exception 'Give a valid email, choose a topic and describe the problem in at least 20 characters' using errcode='22023';
 end;
 return target;
end $$;

-- 7. Salary search still counted and named employers that had been suspended. It now follows the public-listing rule.
create or replace function public.jp_salary_lookup(title text,place text default null) returns jsonb language sql stable security definer set search_path='' as $$
 with wanted as (select lower(regexp_replace(trim(title),'\s+',' ','g')) as k,nullif(trim(coalesce(place,'')),'') as p),
 reported as (select s.period,count(*) n,min(s.pay) lo,percentile_cont(.5) within group(order by s.pay) med,max(s.pay) hi from public.salary_reports s,wanted w
  where s.title_key=w.k and (w.p is null or s.location ilike '%'||w.p||'%') group by s.period having count(*)>=3),
 advertised as (select j.salary_period period,count(*) n,min(j.salary_min) lo,percentile_cont(.5) within group(order by (j.salary_min+j.salary_max)/2) med,max(j.salary_max) hi
  from public.jobs j join public.companies c on c.id=j.company_id,wanted w where j.state='live' and j.expires_at>now() and c.verified_at is not null and c.suspended_at is null and not c.is_agency and j.salary_min is not null and j.salary_max is not null and lower(j.title) like '%'||replace(replace(w.k,'%','\%'),'_','\_')||'%'
  and (w.p is null or exists(select 1 from public.job_locations l where l.job_id=j.id and l.label ilike '%'||w.p||'%')) group by j.salary_period),
 companies as (select c.id,c.name,count(*) n,percentile_cont(.5) within group(order by (j.salary_min+j.salary_max)/2) med,min(j.salary_period) period from public.jobs j join public.companies c on c.id=j.company_id,wanted w
  where j.state='live' and j.expires_at>now() and c.verified_at is not null and c.suspended_at is null and not c.is_agency and j.salary_min is not null and lower(j.title) like '%'||replace(replace(w.k,'%','\%'),'_','\_')||'%' and j.salary_period='year' group by c.id,c.name order by 4 desc limit 10)
 select jsonb_build_object('reported',coalesce((select jsonb_agg(to_jsonb(r)) from reported r),'[]'),'advertised',coalesce((select jsonb_agg(to_jsonb(a)) from advertised a),'[]'),
  'topPaying',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'jobs',n,'median',med)) from companies),'[]'))
$$;

-- 8. Anyone could stop an employer's careers feed being listed by registering an unverified company with that name.
--    Only a verified employer of the same name now counts as already having an account.
create or replace function public.jp_source_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if exists(select 1 from public.companies where lower(name)=lower(trim(payload->>'name')) and verified_at is not null and suspended_at is null) then raise exception 'That employer already has an account. Ask them to add the feed from Import jobs in their portal.' using errcode='22023';end if;
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

commit;
