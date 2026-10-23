-- Email alerts for saved searches: owners choose a frequency, a service-role worker claims due alerts,
-- and every email carries a token that unsubscribes without signing in (Spam Act 2003).
begin;
alter table public.saved_searches add column last_alerted_at timestamptz;
alter table public.saved_searches add column alert_lease_until timestamptz;
alter table public.saved_searches add column alert_lease uuid;
create table private.alert_tokens(saved_search_id uuid primary key references public.saved_searches(id) on delete cascade,token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
alter table private.alert_tokens enable row level security;
revoke all on private.alert_tokens from public,anon,authenticated;

create function public.jp_set_alert(target uuid,wanted text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501';end if;
 if wanted not in ('daily','instant','off') then raise exception 'Choose daily, instant or off' using errcode='22023';end if;
 -- Turning alerts on starts the clock now, so the first email holds only roles posted after that.
 update public.saved_searches set frequency=wanted,last_alerted_at=case when wanted<>'off' and frequency='off' then now() else last_alerted_at end where id=target and user_id=actor;
 if not found then raise exception 'Saved search not found' using errcode='42501';end if;
 if wanted<>'off' then insert into private.alert_tokens(saved_search_id) values(target) on conflict do nothing;end if;
 return jsonb_build_object('id',target,'frequency',wanted);
end $$;
revoke all on function public.jp_set_alert(uuid,text) from public,anon;
grant execute on function public.jp_set_alert(uuid,text) to authenticated;

create function public.jp_unsubscribe_alert(target uuid,secret text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if secret is null or length(secret)<>64 then return false;end if;
 update public.saved_searches s set frequency='off' from private.alert_tokens t where s.id=target and t.saved_search_id=s.id and t.token=secret;
 return found;
end $$;
revoke all on function public.jp_unsubscribe_alert(uuid,text) from public;
grant execute on function public.jp_unsubscribe_alert(uuid,text) to anon,authenticated;

-- Claims up to 50 due alerts for five minutes. "instant" runs every pass (schedule it every 15 to 60 minutes);
-- "daily" waits 23 hours. checked_at becomes the new watermark when the worker finishes.
create function public.jp_claim_job_alerts() returns table(id uuid,email text,filters jsonb,since timestamptz,checked_at timestamptz,lease uuid,token text)
language plpgsql security definer set search_path='' as $$
begin
 return query with due as (
  select s.id from public.saved_searches s join auth.users u on u.id=s.user_id
  where s.frequency<>'off' and u.email_confirmed_at is not null
   and (s.alert_lease_until is null or s.alert_lease_until<now())
   and (s.frequency='instant' or s.last_alerted_at is null or s.last_alerted_at<now()-interval '23 hours')
  order by s.last_alerted_at nulls first limit 50 for update of s skip locked)
 update public.saved_searches s set alert_lease=gen_random_uuid(),alert_lease_until=now()+interval '5 minutes' from due,auth.users u,private.alert_tokens t
 where s.id=due.id and u.id=s.user_id and t.saved_search_id=s.id
 returning s.id,u.email::text,s.filters,coalesce(s.last_alerted_at,now()-interval '1 day'),now(),s.alert_lease,t.token;
end $$;
create function public.jp_finish_job_alert(target uuid,lease uuid,checked timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.saved_searches set last_alerted_at=checked,alert_lease=null,alert_lease_until=null where id=target and alert_lease=lease;
 return found;
end $$;
revoke all on function public.jp_claim_job_alerts(),public.jp_finish_job_alert(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.jp_claim_job_alerts(),public.jp_finish_job_alert(uuid,uuid,timestamptz) to service_role;
grant select(id,company_id,title,description,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,expires_at,state) on public.jobs to service_role;
grant select on public.companies,public.job_locations to service_role;
commit;
