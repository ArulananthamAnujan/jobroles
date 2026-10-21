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
   if k not in ('q','location','company','arrangement','type','sort','salaryMin','salaryMax','salaryPeriod') or jsonb_typeof(search_filters->k)<>'string' or length(search_filters->>k)>120 then raise exception 'Invalid search field' using errcode='22023';end if;
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
