-- Running the marketplace at scale: automatic content checks, optional auto-publishing of clean posts, reports on
-- published content, invalid-click filtering and refunds for sponsored jobs, and support tickets.
begin;

-- Platform settings an administrator can change without a deploy.
create table private.settings(key text primary key,value jsonb not null,updated_at timestamptz not null default now(),updated_by uuid);
insert into private.settings(key,value) values('auto_publish_clean','false'::jsonb);
create function private.setting(name text) returns jsonb language sql stable security definer set search_path='' as $$ select value from private.settings where key=name $$;
revoke all on function private.setting(text) from public;

-- Automatic checks ------------------------------------------------------------------------------------------------
-- Flags things moderators must look at: contact details, links, abusive language, shouting and copy-paste spam.
create function private.content_flags(body text) returns text[] language plpgsql immutable set search_path='' as $$
declare f text[]:='{}'; t text:=coalesce(body,'');
begin
 if t ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then f:=array_append(f,'email address');end if;
 if t ~ '(\+?61|0)[ -]?[2-478]([ -]?\d){8}' or t ~ '\m04\d{2}[ -]?\d{3}[ -]?\d{3}\M' then f:=array_append(f,'phone number');end if;
 if t ~* '(https?://|www\.)' then f:=array_append(f,'link');end if;
 if t ~* '\m(fuck\w*|shit\w*|cunt\w*|bitch\w*|bastard\w*|wank\w*|slut\w*|retard\w*|f\*+k\w*)\M' then f:=array_append(f,'offensive language');end if;
 if length(regexp_replace(t,'[^A-Z]','','g'))>20 and length(regexp_replace(t,'[^A-Z]','','g'))>0.6*greatest(length(regexp_replace(t,'[^A-Za-z]','','g')),1) then f:=array_append(f,'shouting');end if;
 if t ~ '(.)\1{6,}' then f:=array_append(f,'repeated characters');end if;
 if t ~* '\m(scam|fraud|criminal|stole|stealing|theft|assault|harass\w*|racis\w*|sexual\w*|drunk|corrupt\w*)\M' then f:=array_append(f,'serious allegation');end if;
 return f;
end $$;
alter table public.company_reviews add column flags text[] not null default '{}';
alter table public.company_interviews add column flags text[] not null default '{}';
alter table public.company_questions add column flags text[] not null default '{}';
alter table public.company_answers add column flags text[] not null default '{}';

-- On every new or edited post: record flags, and publish clean posts straight away when the setting allows it.
-- Posts with any flag, and posts from accounts less than a day old, always wait for a moderator.
create function private.screen_content() returns trigger language plpgsql security definer set search_path='' as $$
declare txt text; author uuid; fresh boolean;
begin
 -- Separate statements: each table has different columns, and NEW is checked when a statement runs.
 if tg_table_name='company_reviews' then txt:=concat_ws(' ',new.title,new.pros,new.cons,new.job_title);
 elsif tg_table_name='company_interviews' then txt:=concat_ws(' ',new.job_title,new.process,array_to_string(new.questions,' '));
 else txt:=new.body;end if;
 new.flags:=private.content_flags(txt);
 if tg_table_name='company_reviews' then
  if exists(select 1 from public.company_reviews r where r.id<>new.id and r.pros=new.pros and r.cons=new.cons) then new.flags:=array_append(new.flags,'duplicate text');end if;
 end if;
 author:=new.author_id;
 fresh:=coalesce((select created_at>now()-interval '1 day' from auth.users where id=author),true);
 if new.status='pending' and cardinality(new.flags)=0 and not fresh and coalesce((private.setting('auto_publish_clean'))::boolean,false) then
  new.status:='published';new.published_at:=now();new.moderation_reason:='Automatically published: passed content checks';
 end if;
 return new;
end $$;
create trigger screen_review before insert or update of title,pros,cons,status on public.company_reviews for each row when (new.status='pending') execute function private.screen_content();
create trigger screen_interview before insert or update of process,questions,status on public.company_interviews for each row when (new.status='pending') execute function private.screen_content();
create trigger screen_question before insert or update of body,status on public.company_questions for each row when (new.status='pending') execute function private.screen_content();
create trigger screen_answer before insert or update of body,status on public.company_answers for each row when (new.status='pending') execute function private.screen_content();

-- Moderation queues now show the flags so moderators can work fastest-first.
drop function public.jp_pending_reviews();
create function public.jp_pending_reviews() returns table(id uuid,company_id uuid,company_name text,kind text,job_title text,rating smallint,title text,pros text,cons text,created_at timestamptz,flags text[])
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return query select r.id,r.company_id,c.name,r.kind,r.job_title,r.rating,r.title,r.pros,r.cons,r.created_at,r.flags from public.company_reviews r join public.companies c on c.id=r.company_id where r.status='pending' order by cardinality(r.flags),r.created_at limit 200;
end $$;
create or replace function public.jp_pending_community() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by cardinality(array(select jsonb_array_elements_text(x->'flags'))),x->>'createdAt') from (
  select jsonb_build_object('kind','interview','id',i.id,'company',c.name,'title',i.job_title||' interview','body',i.process,'extra',array_to_string(i.questions,' · '),'createdAt',i.created_at,'flags',to_jsonb(i.flags)) x from public.company_interviews i join public.companies c on c.id=i.company_id where i.status='pending'
  union all select jsonb_build_object('kind','question','id',q.id,'company',c.name,'title','Question','body',q.body,'extra','','createdAt',q.created_at,'flags',to_jsonb(q.flags)) from public.company_questions q join public.companies c on c.id=q.company_id where q.status='pending'
  union all select jsonb_build_object('kind','answer','id',a.id,'company',c.name,'title','Answer to: '||q.body,'body',a.body,'extra','','createdAt',a.created_at,'flags',to_jsonb(a.flags)) from public.company_answers a join public.company_questions q on q.id=a.question_id join public.companies c on c.id=q.company_id where a.status='pending'
  limit 300) s),'[]'::jsonb);
end $$;
-- Publish or reject many posts at once (for example every post with no flags).
create function public.jp_bulk_moderate(kind text,targets uuid[],decision text,reason text) returns integer language plpgsql security definer set search_path='' as $$
declare n integer:=0; t uuid;
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if cardinality(targets)>200 then raise exception 'Up to 200 at a time' using errcode='22023';end if;
 foreach t in array targets loop
  begin
   if kind='review' then perform public.jp_moderate_review(t,decision,reason);else perform public.jp_moderate_community(kind,t,decision,reason);end if;
   n:=n+1;
  exception when others then null;
  end;
 end loop;
 return n;
end $$;
create function public.jp_set_auto_publish(enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 update private.settings set value=to_jsonb(enabled),updated_at=now(),updated_by=auth.uid() where key='auto_publish_clean';
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'settings.auto_publish','settings',null,enabled::text);
end $$;
create function public.jp_moderation_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return jsonb_build_object('autoPublishClean',coalesce((private.setting('auto_publish_clean'))::boolean,false));
end $$;

-- Reports on published content ----------------------------------------------------------------------------------
create table public.content_reports(
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('review','interview','question','answer')),target_id uuid not null,
 reporter_id uuid references auth.users(id) on delete set null,reason text not null check(reason in ('false','personal','offensive','spam','conflict','other')),
 details text check(details is null or length(details)<=1000),resolved_at timestamptz,resolution text,created_at timestamptz not null default now(),unique(kind,target_id,reporter_id)
);
alter table public.content_reports enable row level security;revoke all on public.content_reports from anon,authenticated;
create function public.jp_report_content(kind text,target uuid,reason text,details text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to report content' using errcode='42501';end if;
 if kind not in ('review','interview','question','answer') or reason not in ('false','personal','offensive','spam','conflict','other') then raise exception 'Choose what is wrong' using errcode='22023';end if;
 if (select count(*) from public.content_reports where reporter_id=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'You have sent many reports today. Try again tomorrow' using errcode='22023';end if;
 insert into public.content_reports(kind,target_id,reporter_id,reason,details) values(kind,target,auth.uid(),reason,nullif(left(trim(coalesce(details,'')),1000),'')) on conflict do nothing;
end $$;
create function public.jp_content_reports() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by x->>'lastAt' desc) from (
  select jsonb_build_object('kind',r.kind,'id',r.target_id,'reports',count(*),'reasons',jsonb_agg(distinct r.reason),'details',jsonb_agg(r.details) filter(where r.details is not null),'lastAt',max(r.created_at),
   'text',case r.kind when 'review' then (select title||' — '||pros||' / '||cons from public.company_reviews where id=r.target_id) when 'interview' then (select process from public.company_interviews where id=r.target_id)
    when 'question' then (select body from public.company_questions where id=r.target_id) else (select body from public.company_answers where id=r.target_id) end) x
  from public.content_reports r where r.resolved_at is null group by r.kind,r.target_id limit 200) s),'[]'::jsonb);
end $$;
-- Keep a reported post (dismiss the reports) or take it down.
create function public.jp_resolve_report(kind text,target uuid,remove boolean,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if length(trim(coalesce(reason,'')))<3 then raise exception 'Record a reason' using errcode='22023';end if;
 if remove then
  if kind='review' then update public.company_reviews set status='rejected',moderation_reason=trim(reason) where id=target;
  elsif kind='interview' then update public.company_interviews set status='rejected',moderation_reason=trim(reason) where id=target;
  elsif kind='question' then update public.company_questions set status='rejected',moderation_reason=trim(reason) where id=target;
  else update public.company_answers set status='rejected',moderation_reason=trim(reason) where id=target;end if;
 end if;
 update public.content_reports set resolved_at=now(),resolution=case when remove then 'removed' else 'kept' end where content_reports.kind=jp_resolve_report.kind and target_id=target and resolved_at is null;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'report.'||case when remove then 'remove' else 'keep' end,kind,target,trim(reason));
end $$;

-- Invalid clicks ------------------------------------------------------------------------------------------------
alter table public.sponsored_clicks add column network text,add column invalid_reason text;
alter table public.sponsored_clicks drop constraint sponsored_clicks_job_id_visitor_day_key;
create unique index sponsored_clicks_once on public.sponsored_clicks(job_id,visitor,day);
drop function public.jp_record_sponsored_click(uuid,text);
-- Charges a click unless it looks invalid: the same visitor clicking many sponsored jobs in a day, or a burst of
-- clicks on one job from the same network. Invalid clicks are recorded (so employers can see them) but cost nothing.
create function public.jp_record_sponsored_click(target uuid,visitor_key text,network_key text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.job_campaigns%rowtype; click uuid; today date:=(now() at time zone 'Australia/Sydney')::date; why text;
begin
 select * into c from public.job_campaigns where job_id=target for update;
 if not found or not exists(select 1 from public.jp_active_sponsorships(array[target])) or exists(select 1 from public.job_sponsorships where job_id=target and now() between starts_at and ends_at) then return jsonb_build_object('charged',false);end if;
 if not c.active or private.ad_balance(c.company_id)<c.cpc_cents or private.ad_spent_today(target)+c.cpc_cents>c.daily_budget_cents then return jsonb_build_object('charged',false);end if;
 if exists(select 1 from public.sponsored_clicks where job_id=target and visitor=visitor_key and day=today) then return jsonb_build_object('charged',false);end if;
 if (select count(*) from public.sponsored_clicks where visitor=visitor_key and day=today)>=15 then why:='Visitor clicked many sponsored jobs today';
 elsif network_key is not null and (select count(*) from public.sponsored_clicks where job_id=target and network=network_key and day=today and invalid_reason is null)>=5 then why:='Many clicks from one network';
 elsif (select count(*) from public.sponsored_clicks where job_id=target and created_at>now()-interval '1 minute')>=20 then why:='Sudden burst of clicks';
 end if;
 insert into public.sponsored_clicks(job_id,visitor,network,cost_cents,invalid_reason) values(target,visitor_key,network_key,case when why is null then c.cpc_cents else 0 end,why) on conflict do nothing returning id into click;
 if click is null or why is not null then return jsonb_build_object('charged',false,'invalid',why);end if;
 insert into public.ad_credit_ledger(company_id,amount_cents,kind,reference,job_id) values(c.company_id,-c.cpc_cents,'click','click:'||click,target);
 return jsonb_build_object('charged',true,'cost',c.cpc_cents);
end $$;
create or replace function private.ad_spent_today(target uuid) returns integer language sql stable security definer set search_path='' as $$
 select coalesce(sum(cost_cents),0)::integer from public.sponsored_clicks where job_id=target and day=(now() at time zone 'Australia/Sydney')::date and invalid_reason is null
$$;
-- Administrators can refund credit after investigating a complaint.
create function public.jp_refund_credit(company uuid,amount integer,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if amount not between 1 and 1000000 or length(trim(coalesce(reason,'')))<3 then raise exception 'Give an amount and a reason' using errcode='22023';end if;
 insert into public.ad_credit_ledger(company_id,amount_cents,kind,reference,actor_id) values(company,amount,'refund','refund:'||gen_random_uuid(),auth.uid());
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'credit.refund','company',company,format('%s cents: %s',amount,trim(reason)));
 return jsonb_build_object('balance',private.ad_balance(company));
end $$;
-- Click quality for administrators: spend, valid and invalid clicks per company over 7 days.
create function public.jp_click_quality() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x order by (x->>'invalid')::int desc) from (
  select jsonb_build_object('companyId',c.id,'company',c.name,'clicks',count(*) filter(where s.invalid_reason is null),'invalid',count(*) filter(where s.invalid_reason is not null),'spent',coalesce(sum(s.cost_cents),0),'balance',private.ad_balance(c.id)) x
  from public.sponsored_clicks s join public.jobs j on j.id=s.job_id join public.companies c on c.id=j.company_id where s.day>(now() at time zone 'Australia/Sydney')::date-7 group by c.id,c.name) q),'[]'::jsonb);
end $$;
-- The employer view now also counts clicks that were filtered out and not charged.
create or replace function public.jp_ad_account(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter')) then raise exception 'Employer access required' using errcode='42501';end if;
 return jsonb_build_object('balance',private.ad_balance(company),
  'invalid7',(select count(*) from public.sponsored_clicks s join public.jobs j on j.id=s.job_id where j.company_id=company and s.invalid_reason is not null and s.day>(now() at time zone 'Australia/Sydney')::date-7),
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('jobId',j.id,'title',j.title,'campaign',case when c.job_id is null then null else jsonb_build_object('dailyBudget',c.daily_budget_cents,'cpc',c.cpc_cents,'active',c.active) end,
    'spentToday',private.ad_spent_today(j.id),'clicks7',(select count(*) from public.sponsored_clicks s where s.job_id=j.id and s.invalid_reason is null and s.day>(now() at time zone 'Australia/Sydney')::date-7),
    'spent7',(select coalesce(sum(cost_cents),0) from public.sponsored_clicks s where s.job_id=j.id and s.day>(now() at time zone 'Australia/Sydney')::date-7),
    'applications7',(select count(*) from public.applications a where a.job_id=j.id and a.state<>'draft' and a.submitted_at>now()-interval '7 days'),
    'showing',exists(select 1 from public.jp_active_sponsorships(array[j.id]))) order by j.published_at desc)
   from public.jobs j left join public.job_campaigns c on c.job_id=j.id where j.company_id=company and j.state='live' and j.expires_at>now()),'[]'::jsonb),
  'ledger',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'amount',l.amount_cents,'kind',l.kind,'createdAt',l.created_at,'invoiceUrl',l.invoice_url) order by l.created_at desc)
   from (select * from public.ad_credit_ledger where company_id=company and kind<>'click' order by created_at desc limit 50) l),'[]'::jsonb));
end $$;

-- Support tickets ------------------------------------------------------------------------------------------------
create table public.support_tickets(
 id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,email text not null check(email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email)<=254),
 name text check(name is null or length(name)<=120),topic text not null check(topic in ('account','application','job','employer','billing','privacy','report','other')),
 message text not null check(length(message) between 20 and 5000),status text not null default 'open' check(status in ('open','answered','closed')),
 admin_note text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index support_open on public.support_tickets(status,created_at);
alter table public.support_tickets enable row level security;revoke all on public.support_tickets from anon,authenticated;
grant select(id,topic,message,status,created_at,updated_at) on public.support_tickets to authenticated;
create policy tickets_own on public.support_tickets for select to authenticated using(user_id=(select auth.uid()));
create function public.jp_submit_ticket(contact text,full_name text,topic text,body text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; mail text:=coalesce((select email from auth.users where id=auth.uid()),trim(contact));
begin
 if (select count(*) from public.support_tickets where (user_id=auth.uid() or email=mail) and created_at>now()-interval '1 day')>=5 then raise exception 'You have sent several requests today. We will reply to those first' using errcode='22023';end if;
 begin
  insert into public.support_tickets(user_id,email,name,topic,message) values(auth.uid(),mail,nullif(left(trim(coalesce(full_name,'')),120),''),topic,trim(body)) returning id into target;
 exception when check_violation or not_null_violation then raise exception 'Give a valid email, choose a topic and describe the problem in at least 20 characters' using errcode='22023';
 end;
 return target;
end $$;
create function public.jp_support_queue(include_closed boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from (select id,email,name,topic,message,status,admin_note,created_at from public.support_tickets where include_closed or status<>'closed' order by created_at limit 300) t),'[]'::jsonb);
end $$;
create function public.jp_update_ticket(target uuid,next_status text,note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if next_status not in ('open','answered','closed') then raise exception 'Invalid status' using errcode='22023';end if;
 update public.support_tickets set status=next_status,admin_note=nullif(left(trim(coalesce(note,'')),2000),''),updated_at=now() where id=target;
end $$;

-- Review and salary prompts --------------------------------------------------------------------------------------
-- Companies a seeker has applied to (decided or 14+ days old) that they have not reviewed yet.
create function public.jp_review_prompts() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('companyId',c.id,'company',c.name,'jobTitle',x.title,'stage',x.stage)),'[]'::jsonb) from (
  select distinct on (j.company_id) j.company_id,j.title,a.stage from public.applications a join public.jobs j on j.id=a.job_id
  where a.seeker_id=auth.uid() and a.state<>'draft' and (a.stage in ('rejected','offer','hired','interview') or a.submitted_at<now()-interval '14 days')
   and not exists(select 1 from public.company_reviews r where r.company_id=j.company_id and r.author_id=auth.uid() and r.kind='hiring')
  order by j.company_id,a.submitted_at desc limit 5) x join public.companies c on c.id=x.company_id
$$;

revoke all on function public.jp_bulk_moderate(text,uuid[],text,text),public.jp_set_auto_publish(boolean),public.jp_moderation_settings(),public.jp_report_content(text,uuid,text,text),public.jp_content_reports(),public.jp_resolve_report(text,uuid,boolean,text),
 public.jp_refund_credit(uuid,integer,text),public.jp_click_quality(),public.jp_support_queue(boolean),public.jp_update_ticket(uuid,text,text),public.jp_review_prompts(),public.jp_pending_reviews() from public,anon;
grant execute on function public.jp_bulk_moderate(text,uuid[],text,text),public.jp_set_auto_publish(boolean),public.jp_moderation_settings(),public.jp_report_content(text,uuid,text,text),public.jp_content_reports(),public.jp_resolve_report(text,uuid,boolean,text),
 public.jp_refund_credit(uuid,integer,text),public.jp_click_quality(),public.jp_support_queue(boolean),public.jp_update_ticket(uuid,text,text),public.jp_review_prompts(),public.jp_pending_reviews() to authenticated;
revoke all on function public.jp_submit_ticket(text,text,text,text) from public;
grant execute on function public.jp_submit_ticket(text,text,text,text) to anon,authenticated;
revoke all on function public.jp_record_sponsored_click(uuid,text,text) from public,anon,authenticated;
grant execute on function public.jp_record_sponsored_click(uuid,text,text) to service_role;
revoke all on function private.content_flags(text),private.screen_content() from public;
commit;
