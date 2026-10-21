create table public.privacy_requests (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 requester_email text not null,kind text not null check(kind in ('deletion','correction','access')),
 detail text not null check(length(detail) between 10 and 3000),
 status text not null default 'requested' check(status in ('requested','reviewing','responded','cancelled')),
 response text,reviewer_id uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from public,anon,authenticated;
grant select on public.privacy_requests to authenticated;
create index privacy_requests_user on public.privacy_requests(user_id,created_at desc);
create index privacy_requests_queue on public.privacy_requests(status,created_at);
create policy privacy_requests_self on public.privacy_requests for select to authenticated using(user_id=(select auth.uid()));
create policy privacy_requests_admin on public.privacy_requests for select to authenticated using((select private.is_admin()));
create function private.privacy_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();target uuid;r public.privacy_requests%rowtype;details text;requested_kind text;reply text;wanted text;account_email text;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
 select email into account_email from auth.users where id=actor and email_confirmed_at is not null for update;
 if not found then raise exception 'Confirmed account required' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023';end if;
 if action='create' then
  requested_kind:=payload->>'kind';details:=trim(payload->>'detail');
  if requested_kind is null or requested_kind not in ('deletion','correction','access') or details is null or length(details) not between 10 and 3000 then raise exception 'Describe your privacy request' using errcode='22023';end if;
  if exists(select 1 from public.privacy_requests where user_id=actor and kind=requested_kind and status in ('requested','reviewing')) then raise exception 'An open request of this type already exists' using errcode='22023';end if;
  if (select count(*) from public.privacy_requests where user_id=actor and created_at>now()-interval '1 day')>=5 then raise exception 'Daily request limit reached' using errcode='22023';end if;
  insert into public.privacy_requests(user_id,requester_email,kind,detail) values(actor,account_email,requested_kind,details) returning id into target;
  if requested_kind='deletion' then update public.seeker_profiles set searchable=false,search_consent_at=null where user_id=actor;end if;
 elsif action='cancel' then
  target:=(payload->>'id')::uuid;
  select * into r from public.privacy_requests where id=target for update;
  if not found or r.user_id<>actor or r.status not in ('requested','reviewing') then raise exception 'Request cannot be cancelled' using errcode='42501';end if;
  update public.privacy_requests set status='cancelled',updated_at=now() where id=target;
 elsif action='respond' then
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
  target:=(payload->>'id')::uuid;reply:=trim(payload->>'response');wanted:=payload->>'status';
  if reply is null or length(reply) not between 10 and 3000 or wanted is null or wanted not in ('reviewing','responded') then raise exception 'Provide a response and status' using errcode='22023';end if;
  select * into r from public.privacy_requests where id=target for update;
  if not found or r.status='cancelled' then raise exception 'Request unavailable' using errcode='22023';end if;
  update public.privacy_requests set status=wanted,response=reply,reviewer_id=actor,updated_at=now() where id=target;
 else raise exception 'Unknown operation' using errcode='22023';end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'privacy.'||action,'privacy_request',target,'Privacy request status changed');
 return jsonb_build_object('id',target);
end;$$;
revoke all on function private.privacy_command(text,jsonb) from public,anon;
grant execute on function private.privacy_command(text,jsonb) to authenticated;
create function public.jp_privacy_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.privacy_command(action,payload)$$;
revoke all on function public.jp_privacy_command(text,jsonb) from public,anon;
grant execute on function public.jp_privacy_command(text,jsonb) to authenticated;
