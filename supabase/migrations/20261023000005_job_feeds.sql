-- Employers import roles from their ATS or careers site. Every imported role must state its pay range,
-- goes through moderation unless an administrator trusts the feed, and closes when it leaves the feed.
begin;
create table public.job_feeds(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 url text not null check(url ~ '^https://[^\s/]+[^\s]*$' and length(url)<=2000),format text not null check(format in ('json','xml')),
 active boolean not null default true,auto_publish boolean not null default false,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 last_run_at timestamptz,last_status text,last_error text,lease uuid,lease_until timestamptz,unique(company_id,url)
);
create table public.job_feed_items(feed_id uuid not null references public.job_feeds(id) on delete cascade,external_id text not null check(length(external_id) between 1 and 200),job_id uuid not null references public.jobs(id),primary key(feed_id,external_id));
alter table public.job_feeds enable row level security;
alter table public.job_feed_items enable row level security;
revoke all on public.job_feeds,public.job_feed_items from anon,authenticated;
grant select(id,company_id,url,format,active,auto_publish,created_at,last_run_at,last_status,last_error) on public.job_feeds to authenticated;
create policy feeds_team on public.job_feeds for select to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=job_feeds.company_id and m.user_id=(select auth.uid()) and m.revoked_at is null and m.role in ('owner','recruiter')) or private.is_admin());

create function public.jp_feed_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); f public.job_feeds%rowtype; target uuid;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501';end if;
 case action
 when 'create' then
  target:=(payload->>'companyId')::uuid;
  if not private.owner_permission(target) then raise exception 'Company owner required' using errcode='42501';end if;
  if not exists(select 1 from public.companies where id=target and verified_at is not null and suspended_at is null) then raise exception 'Only verified employers can import jobs' using errcode='22023';end if;
  if (select count(*) from public.job_feeds where company_id=target)>=5 then raise exception 'Up to five feeds per company' using errcode='22023';end if;
  if coalesce(payload->>'url','') !~ '^https://[^\s/]+[^\s]*$' or length(payload->>'url')>2000 or coalesce(payload->>'format','') not in ('json','xml') then raise exception 'Enter an https feed address and its format' using errcode='22023';end if;
  insert into public.job_feeds(company_id,url,format,created_by) values(target,payload->>'url',payload->>'format',actor) returning id into target;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'feed.create','job_feed',target,payload->>'url');
  return jsonb_build_object('id',target);
 when 'pause','resume','delete' then
  select * into f from public.job_feeds where id=(payload->>'id')::uuid for update;
  if not found or not private.owner_permission(f.company_id) then raise exception 'Feed access denied' using errcode='42501';end if;
  if action='delete' then
   -- Roles that came from the feed close with it; links to them keep working for applicants.
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
end $$;
revoke all on function public.jp_feed_command(text,jsonb) from public,anon;
grant execute on function public.jp_feed_command(text,jsonb) to authenticated;

create function public.jp_claim_job_feeds() returns setof public.job_feeds language plpgsql security definer set search_path='' as $$
begin
 return query with due as (select f.id from public.job_feeds f join public.companies c on c.id=f.company_id
  where f.active and c.verified_at is not null and c.suspended_at is null and (f.lease_until is null or f.lease_until<now()) and (f.last_run_at is null or f.last_run_at<now()-interval '55 minutes')
  order by f.last_run_at nulls first limit 10 for update of f skip locked)
 update public.job_feeds f set lease=gen_random_uuid(),lease_until=now()+interval '10 minutes' from due where f.id=due.id returning f.*;
end $$;

-- items: [{externalId,title,description,type,arrangement,locations[],min,max,period,expiresAt?}], already validated by the worker
-- and validated again here. Returns counts. A failed feed (items null) only records the error.
create function public.jp_import_feed(feed uuid,lease uuid,items jsonb,problem text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.job_feeds%rowtype; item jsonb; existing uuid; target uuid; created int:=0; updated int:=0; closed int:=0; rejected int:=0; seen text[]:='{}'; state_value public.job_state; expires timestamptz;
begin
 select * into f from public.job_feeds where id=feed and job_feeds.lease=jp_import_feed.lease for update;
 if not found then raise exception 'Feed lease expired' using errcode='22023';end if;
 if items is null or jsonb_typeof(items)<>'array' then
  update public.job_feeds set last_run_at=now(),last_status='failed',last_error=left(coalesce(problem,'Feed could not be read'),500),lease=null,lease_until=null where id=feed;
  return jsonb_build_object('failed',true);
 end if;
 for item in select * from jsonb_array_elements(items) limit 2000 loop
  if coalesce(item->>'externalId','')='' or length(item->>'externalId')>200 or coalesce(trim(item->>'title'),'')='' or length(item->>'title')>140 or length(coalesce(item->>'description',''))<40
   or coalesce(item->>'type','') not in ('Full-time','Part-time','Casual','Contract','Temporary','Internship') or coalesce(item->>'arrangement','') not in ('on_site','hybrid','remote')
   or jsonb_typeof(item->'locations')<>'array' or jsonb_array_length(item->'locations') not between 1 and 20
   or (item->>'min') is null or (item->>'max') is null or (item->>'min')::numeric<0 or (item->>'max')::numeric<(item->>'min')::numeric or coalesce(item->>'period','') not in ('hour','day','month','year')
   or (item->>'externalId')=any(seen) then rejected:=rejected+1;continue;end if;
  seen:=seen||(item->>'externalId');
  expires:=least(coalesce((item->>'expiresAt')::timestamptz,now()+interval '30 days'),now()+interval '60 days');
  select job_id into existing from public.job_feed_items where feed_id=feed and external_id=item->>'externalId';
  if existing is null then
   state_value:=case when f.auto_publish then 'live' else 'pending_review' end;
   insert into public.jobs(company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,expires_at)
   values(f.company_id,trim(item->>'title'),left(item->>'description',30000),state_value,item->>'type',item->>'arrangement',(item->>'min')::numeric,(item->>'max')::numeric,item->>'period','AUD',case when f.auto_publish then now() end,case when f.auto_publish then expires end) returning id into target;
   insert into public.job_locations(job_id,label) select target,left(value,160) from jsonb_array_elements_text(item->'locations');
   insert into public.screening_questions(job_id,question,required,must_have,expected_answer,position) values(target,'Are you authorised to work in Australia?',true,true,'Yes',0);
   insert into public.job_feed_items(feed_id,external_id,job_id) values(feed,item->>'externalId',target);
   insert into private.outbox(event_type,entity_id) values('job.changed',target);
   created:=created+1;
  else
   -- Changed content on a moderated feed goes back to review, as a manual edit would.
   update public.jobs j set title=trim(item->>'title'),description=left(item->>'description',30000),employment_type=item->>'type',arrangement=item->>'arrangement',salary_min=(item->>'min')::numeric,salary_max=(item->>'max')::numeric,salary_period=item->>'period',
    expires_at=case when j.state='live' then expires else j.expires_at end,
    state=case when j.state='live' and not f.auto_publish then 'pending_review'::public.job_state else j.state end
   where j.id=existing and j.state in ('live','pending_review','paused') and (j.title,j.description,j.employment_type,j.arrangement,j.salary_min,j.salary_max,j.salary_period) is distinct from (trim(item->>'title'),left(item->>'description',30000),item->>'type',item->>'arrangement',(item->>'min')::numeric,(item->>'max')::numeric,item->>'period');
   if found then
    delete from public.job_locations where job_id=existing;
    insert into public.job_locations(job_id,label) select existing,left(value,160) from jsonb_array_elements_text(item->'locations');
    updated:=updated+1;
   end if;
  end if;
 end loop;
 update public.jobs set state='closed' where id in (select job_id from public.job_feed_items where feed_id=feed and not (external_id=any(seen))) and state in ('live','pending_review','paused');
 get diagnostics closed=row_count;
 update public.job_feeds set last_run_at=now(),last_status=format('%s new, %s updated, %s closed, %s rejected',created,updated,closed,rejected),last_error=null,lease=null,lease_until=null where id=feed;
 return jsonb_build_object('created',created,'updated',updated,'closed',closed,'rejected',rejected);
end $$;
revoke all on function public.jp_claim_job_feeds(),public.jp_import_feed(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.jp_claim_job_feeds(),public.jp_import_feed(uuid,uuid,jsonb,text) to service_role;
commit;
