-- Browser and installed-app push subscriptions. Job alerts are pushed to them as well as emailed.
begin;
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique check(endpoint ~ '^https://' and length(endpoint)<=1000),p256dh text not null check(length(p256dh) between 80 and 100),auth text not null check(length(auth) between 16 and 30),
 created_at timestamptz not null default now(),last_success_at timestamptz);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon,authenticated;
grant select(id,endpoint,created_at) on public.push_subscriptions to authenticated;
create policy push_self on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create function public.jp_save_push(endpoint text,p256dh text,auth text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to turn on notifications' using errcode='42501';end if;
 if (select count(*) from public.push_subscriptions where user_id=auth.uid())>=10 then delete from public.push_subscriptions where id=(select id from public.push_subscriptions where user_id=auth.uid() order by created_at limit 1);end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),endpoint,p256dh,jp_save_push.auth)
 on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,created_at=now();
 return true;
end $$;
create function public.jp_delete_push(endpoint text) returns boolean language sql security definer set search_path='' as $$
 delete from public.push_subscriptions where push_subscriptions.endpoint=jp_delete_push.endpoint and user_id=auth.uid() returning true
$$;
revoke all on function public.jp_save_push(text,text,text),public.jp_delete_push(text) from public,anon;
grant execute on function public.jp_save_push(text,text,text),public.jp_delete_push(text) to authenticated;
grant select,update,delete on public.push_subscriptions to service_role;

-- The alert worker needs the owner to find their push subscriptions.
drop function public.jp_claim_job_alerts();
create function public.jp_claim_job_alerts() returns table(id uuid,user_id uuid,email text,filters jsonb,since timestamptz,checked_at timestamptz,lease uuid,token text)
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
 returning s.id,s.user_id,u.email::text,s.filters,coalesce(s.last_alerted_at,now()-interval '1 day'),now(),s.alert_lease,t.token;
end $$;
revoke all on function public.jp_claim_job_alerts() from public,anon,authenticated;
grant execute on function public.jp_claim_job_alerts() to service_role;
commit;
