create table private.notification_deliveries (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references private.outbox(id),
 application_id uuid not null references public.applications(id),recipient_id uuid not null references auth.users(id),recipient_email text not null,
 event_type text not null,state text not null default 'pending' check(state in ('pending','sending','accepted','failed','skipped')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,
 provider_id text,last_error text,created_at timestamptz not null default now(),unique(event_id,recipient_id)
);
alter table private.notification_deliveries enable row level security;
revoke all on private.notification_deliveries from public,anon,authenticated;
create index notification_pending on private.notification_deliveries(state,available_at);
create function private.queue_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or new.event_type not in ('application.submitted','application.move','application.interview','application.reinstate','application.withdraw','application.request_reinstatement','message.send') then return new;end if;
 insert into private.notification_deliveries(event_id,application_id,recipient_id,recipient_email,event_type)
 select distinct new.id,a.id,u.id,u.email,new.event_type from public.applications a
 join public.jobs j on j.id=a.job_id
 join auth.users u on (u.id=a.seeker_id or exists(select 1 from public.company_memberships m where m.company_id=j.company_id and m.user_id=u.id and m.revoked_at is null and (m.role='owner' or m.role='recruiter' and exists(select 1 from public.job_assignments ja where ja.job_id=j.id and ja.user_id=u.id))))
 where a.id=new.entity_id and a.state<>'draft' and u.id<>actor and u.email_confirmed_at is not null
 and not exists(select 1 from public.company_blocks b where b.seeker_id=a.seeker_id and b.company_id=j.company_id)
 on conflict do nothing;
 return new;
end;$$;
revoke all on function private.queue_notification() from public,anon,authenticated;
create trigger notification_queue after insert on private.outbox for each row execute function private.queue_notification();
-- Dedicated service-role RPCs remain invoker functions. End-user JWTs cannot call them.
grant usage on schema private,auth to service_role;
grant select,update on private.notification_deliveries to service_role;
grant select on public.applications,public.jobs,public.company_memberships,public.job_assignments,public.company_blocks to service_role;
grant select(id,email,email_confirmed_at) on auth.users to service_role;
create function public.jp_claim_notification_mail() returns setof private.notification_deliveries language plpgsql security invoker set search_path='' as $$
begin
 update private.notification_deliveries set state='failed',last_error='Delivery retry window exceeded' where state in ('pending','sending') and (lease_until is null or lease_until<now()) and (created_at<now()-interval '23 hours' or attempts>=5);
 update private.notification_deliveries d set state='skipped',last_error='Recipient no longer eligible' where d.state in ('pending','sending') and (d.lease_until is null or d.lease_until<now()) and not exists(
 select 1 from public.applications a join public.jobs j on j.id=a.job_id join auth.users u on u.id=d.recipient_id
 where a.id=d.application_id and u.email=d.recipient_email and u.email_confirmed_at is not null and a.state<>'draft'
 and (a.seeker_id=u.id or exists(select 1 from public.company_memberships m where m.company_id=j.company_id and m.user_id=u.id and m.revoked_at is null and (m.role='owner' or m.role='recruiter' and exists(select 1 from public.job_assignments ja where ja.job_id=j.id and ja.user_id=u.id))))
 and not exists(select 1 from public.company_blocks b where b.seeker_id=a.seeker_id and b.company_id=j.company_id));
 return query with picked as (select id from private.notification_deliveries where state in ('pending','sending') and available_at<=now() and (lease_until is null or lease_until<now()) and attempts<5 order by created_at,id for update skip locked limit 10)
 update private.notification_deliveries d set state='sending',attempts=d.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' from picked p where d.id=p.id returning d.*;
end;$$;
create function public.jp_finish_notification_mail(delivery_id uuid,lease uuid,accepted boolean,provider_reference text default null) returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 update private.notification_deliveries set state=case when accepted then 'accepted' when attempts>=5 then 'failed' else 'pending' end,provider_id=case when accepted then left(provider_reference,200) else null end,last_error=case when accepted then null else 'Provider request failed; retry scheduled' end,available_at=now()+interval '5 minutes',lease_until=null
 where id=delivery_id and lease_token=lease and state='sending';
 get diagnostics changed=row_count;return changed=1;
end;$$;
revoke all on function public.jp_claim_notification_mail() from public,anon,authenticated;
revoke all on function public.jp_finish_notification_mail(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.jp_claim_notification_mail() to service_role;
grant execute on function public.jp_finish_notification_mail(uuid,uuid,boolean,text) to service_role;
create function private.notification_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return (select jsonb_build_object('pending',count(*) filter(where state='pending'),'sending',count(*) filter(where state='sending'),'accepted',count(*) filter(where state='accepted'),'failed',count(*) filter(where state='failed'),'skipped',count(*) filter(where state='skipped'),'latest',max(created_at)) from private.notification_deliveries);
end;$$;
revoke all on function private.notification_status() from public,anon;
grant execute on function private.notification_status() to authenticated;
create function public.jp_notification_status() returns jsonb language sql security invoker set search_path='' as $$select private.notification_status()$$;
revoke all on function public.jp_notification_status() from public,anon;
grant execute on function public.jp_notification_status() to authenticated;
