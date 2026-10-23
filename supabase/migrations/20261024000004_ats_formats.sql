-- Feeds can also read the public job-board APIs of Greenhouse and Lever directly.
begin;
alter table public.job_feeds drop constraint job_feeds_format_check;
alter table public.job_feeds add constraint job_feeds_format_check check(format in ('json','xml','greenhouse','lever'));
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
  if coalesce(payload->>'url','') !~ '^https://[^\s/]+[^\s]*$' or length(payload->>'url')>2000 or coalesce(payload->>'format','') not in ('json','xml','greenhouse','lever') then raise exception 'Enter an https feed address and its format' using errcode='22023';end if;
  insert into public.job_feeds(company_id,url,format,created_by) values(target,payload->>'url',payload->>'format',actor) returning id into target;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'feed.create','job_feed',target,payload->>'url');
  return jsonb_build_object('id',target);
 when 'pause','resume','delete' then
  select * into f from public.job_feeds where id=(payload->>'id')::uuid for update;
  if not found or not private.owner_permission(f.company_id) then raise exception 'Feed access denied' using errcode='42501';end if;
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
commit;
