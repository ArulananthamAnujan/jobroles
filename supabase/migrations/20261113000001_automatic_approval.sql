-- Automatic approval, so a new employer can register, post a job and see it live in about a minute without waiting
-- for a person. A person is still asked whenever something looks wrong:
--   * a company is verified automatically when its ABN is a genuine-format ABN (11 digits that pass the ABN check
--     digits) that no other company on the site is using. Anything else waits for an administrator.
--   * a job sent for approval goes live one minute later when its company is verified and not suspended, is not a
--     recruitment agency, and the scam checks raised nothing. Flagged jobs wait for an administrator.
-- Every automatic decision is written to the audit log.
begin;

alter table public.jobs add column review_requested_at timestamptz;
update public.jobs set review_requested_at=now() where state='pending_review';

create function private.mark_review_requested() returns trigger language plpgsql set search_path='' as $$
begin
 if new.state='pending_review' and (tg_op='INSERT' or old.state is distinct from new.state) then new.review_requested_at:=now();end if;
 return new;
end $$;
create trigger job_review_requested before insert or update of state on public.jobs for each row execute function private.mark_review_requested();

-- The Australian Business Register's check: subtract 1 from the first digit, weight the digits, total must divide by 89.
create function private.valid_abn(abn text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(abn ~ '^\d{11}$' and (
  select sum((substr(abn,i,1)::int - case when i=1 then 1 else 0 end)*(array[10,1,3,5,7,9,11,13,15,17,19])[i]) from generate_series(1,11) i)%89=0,false)
$$;

create function private.auto_approve() returns jsonb language plpgsql security definer set search_path='' as $$
declare companies_done int;jobs_done int;
begin
 with done as (
  update public.companies c set verified_at=now()
  where c.verified_at is null and c.suspended_at is null and not coalesce(c.sourced,false) and c.created_at<=now()-interval '1 minute'
   and private.valid_abn(c.abn) and not exists(select 1 from public.companies o where o.abn=c.abn and o.id<>c.id)
  returning c.id),
 logged as (insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) select null,'company.auto_verified','company',id,'ABN passed the automatic check and is not used by another company' from done returning 1)
 select count(*) into companies_done from logged;

 with done as (
  update public.jobs j set state='live',published_at=now(),expires_at=now()+interval '30 days'
  from public.companies c
  where c.id=j.company_id and j.state='pending_review' and coalesce(j.review_requested_at,j.created_at)<=now()-interval '1 minute'
   and c.verified_at is not null and c.suspended_at is null and not c.is_agency
   and not exists(select 1 from private.job_risk r where r.job_id=j.id and cardinality(r.flags)>0)
  returning j.id),
 logged as (insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) select null,'job.auto_approved','job',id,'Verified employer, no risk flags, one minute after it was sent for approval' from done returning entity_id),
 queued as (insert into private.outbox(event_type,entity_id) select 'job.reviewed',entity_id from logged returning 1)
 select count(*) into jobs_done from queued;
 return jsonb_build_object('companies',companies_done,'jobs',jobs_done);
end $$;
revoke all on function private.auto_approve() from public;

-- The site also calls this when an employer opens their jobs, so approval never depends on the schedule below.
-- It only applies the rules above, so it is safe for any signed-in person to trigger.
create function public.jp_auto_approve() returns jsonb language sql security definer set search_path='' as $$select private.auto_approve()$$;
revoke all on function public.jp_auto_approve() from public,anon;
grant execute on function public.jp_auto_approve() to authenticated;

-- Run every minute where scheduling is available (it is on Supabase).
do $$
begin
 create extension if not exists pg_cron;
 perform cron.unschedule(jobid) from cron.job where jobname='jobroles-auto-approve';
 perform cron.schedule('jobroles-auto-approve','* * * * *','select private.auto_approve()');
exception when others then raise notice 'Scheduling is not available here (%); approval runs when employers open their jobs.',sqlerrm;
end $$;
commit;
