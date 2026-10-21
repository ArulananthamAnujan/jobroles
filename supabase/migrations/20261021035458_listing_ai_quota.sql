-- Counters contain no prompts or generated text. Only this checked function may mutate them.
create table private.listing_ai_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 usage_day date not null, attempts integer not null check (attempts between 1 and 10),
 last_attempt timestamptz not null
);
alter table private.listing_ai_usage enable row level security;
revoke all on private.listing_ai_usage from public,anon,authenticated;
create function private.consume_listing_ai_quota(p_company uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); today date := (now() at time zone 'UTC')::date; accepted uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
  raise exception 'Confirmed account required';
 end if;
 if not exists(select 1 from public.company_memberships m join public.companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=actor and m.role in ('owner','recruiter') and m.revoked_at is null and c.suspended_at is null) then
  raise exception 'Employer access required';
 end if;
 insert into private.listing_ai_usage(user_id,usage_day,attempts,last_attempt) values(actor,today,1,now())
 on conflict(user_id) do update set usage_day=today,
 attempts=case when listing_ai_usage.usage_day=today then listing_ai_usage.attempts+1 else 1 end,last_attempt=now()
 where (listing_ai_usage.usage_day<>today or listing_ai_usage.attempts<10)
 and listing_ai_usage.last_attempt<=now()-interval '1 minute'
 returning user_id into accepted;
 return accepted is not null;
end;$$;
revoke all on function private.consume_listing_ai_quota(uuid) from public,anon;
grant execute on function private.consume_listing_ai_quota(uuid) to authenticated;
create function public.jp_listing_ai_quota(p_company uuid) returns boolean
language sql security invoker set search_path = '' as $$ select private.consume_listing_ai_quota(p_company); $$;
revoke all on function public.jp_listing_ai_quota(uuid) from public,anon;
grant execute on function public.jp_listing_ai_quota(uuid) to authenticated;
