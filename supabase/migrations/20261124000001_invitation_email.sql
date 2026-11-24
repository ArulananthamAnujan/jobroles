-- Team invitations are emailed to the person invited, and the invitation page can show who is inviting them before
-- they sign in or create an account.
--
-- The invitation link contains a secret that the database only ever stored as a hash. To email the link, the secret
-- is kept in a private queue just long enough for the notification-mail worker to send it, then erased.
begin;

create table private.invitation_mail(
 id uuid primary key default gen_random_uuid(),
 invitation_id uuid not null unique references public.company_invitations(id) on delete cascade,
 token text,state text not null default 'pending' check(state in ('pending','sending','accepted','failed')),
 attempts int not null default 0,lease_token uuid,lease_until timestamptz,last_error text,
 created_at timestamptz not null default now(),sent_at timestamptz);
alter table private.invitation_mail enable row level security;
revoke all on private.invitation_mail from public,anon,authenticated;
create index invitation_mail_pending on private.invitation_mail(state,created_at);

-- Called by the site straight after an owner creates an invitation. The secret must match the invitation, so nobody
-- can queue an email for an invitation they do not hold the link to. At most 30 invitation emails a company a day.
create function public.jp_queue_invitation_mail(invitation uuid,secret text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.company_invitations;
begin
 select * into i from public.company_invitations where id=invitation;
 if not found or not private.owner_permission(i.company_id) then raise exception 'Owner required' using errcode='42501';end if;
 if secret is null or secret !~ '^[0-9a-f]{64}$' or encode(sha256(convert_to(secret,'UTF8')),'hex')<>i.token_hash or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() then
  raise exception 'Invitation is invalid or expired' using errcode='22023';end if;
 if (select count(*) from private.invitation_mail m join public.company_invitations c on c.id=m.invitation_id where c.company_id=i.company_id and m.created_at>now()-interval '1 day')>=30 then
  raise exception 'You have sent 30 invitations today. Try again tomorrow, or share the link yourself.' using errcode='22023';end if;
 insert into private.invitation_mail(invitation_id,token) values(i.id,secret)
 on conflict(invitation_id) do update set token=excluded.token,state='pending',attempts=0,lease_token=null,lease_until=null,last_error=null;
 return jsonb_build_object('queued',true);
end $$;
revoke all on function public.jp_queue_invitation_mail(uuid,text) from public,anon;
grant execute on function public.jp_queue_invitation_mail(uuid,text) to authenticated;

-- For the mail worker: hands out up to 20 invitation emails to send, each with a short lease.
create function public.jp_claim_invitation_mail() returns table(id uuid,lease_token uuid,email text,company text,role text,inviter text,token text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 -- Give up on emails that failed five times, and on invitations that were cancelled, accepted or have expired.
 update private.invitation_mail m set state='failed',token=null,last_error=coalesce(m.last_error,'Invitation is no longer open')
 where m.state in ('pending','sending') and (m.lease_until is null or m.lease_until<now())
  and (m.attempts>=5 or exists(select 1 from public.company_invitations i where i.id=m.invitation_id and (i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now())));
 return query
 with picked as (select m.id from private.invitation_mail m where m.state in ('pending','sending') and m.token is not null and (m.lease_until is null or m.lease_until<now()) order by m.created_at limit 20 for update skip locked),
 leased as (update private.invitation_mail m set state='sending',attempts=m.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' from picked p where m.id=p.id returning m.*)
 select l.id,l.lease_token,i.email,c.name,i.role::text,
  coalesce((select to_jsonb(u)->'raw_user_meta_data'->>'full_name' from public.company_memberships ms join auth.users u on u.id=ms.user_id where ms.company_id=i.company_id and ms.role='owner' and ms.revoked_at is null order by ms.user_id limit 1),''),
  l.token,i.expires_at
 from leased l join public.company_invitations i on i.id=l.invitation_id join public.companies c on c.id=i.company_id;
end $$;
create function public.jp_finish_invitation_mail(mail_id uuid,lease uuid,accepted boolean,problem text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 update private.invitation_mail set state=case when accepted then 'accepted' when attempts>=5 then 'failed' else 'pending' end,
  token=case when accepted or attempts>=5 then null else token end,sent_at=case when accepted then now() else sent_at end,
  last_error=case when accepted then null else left(coalesce(problem,'Email was not accepted'),300) end,lease_token=null,lease_until=null
 where id=mail_id and lease_token=lease;
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.jp_claim_invitation_mail(),public.jp_finish_invitation_mail(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.jp_claim_invitation_mail(),public.jp_finish_invitation_mail(uuid,uuid,boolean,text) to service_role;

-- For the Team screen: whether each open invitation's email has gone ("sent"), is on its way ("sending"), or could
-- not be sent ("failed"). Invitations made before this update have no email ("none").
create function public.jp_invitation_mail_states(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.owner_permission(company) then raise exception 'Owner required' using errcode='42501';end if;
 return coalesce((select jsonb_object_agg(i.id,case m.state when 'accepted' then 'sent' when 'failed' then 'failed' when 'pending' then 'sending' when 'sending' then 'sending' else 'none' end)
  from public.company_invitations i left join private.invitation_mail m on m.invitation_id=i.id
  where i.company_id=company and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'{}'::jsonb);
end $$;
revoke all on function public.jp_invitation_mail_states(uuid) from public,anon;
grant execute on function public.jp_invitation_mail_states(uuid) to authenticated;

-- For the invitation page: what the holder of an invitation link is being invited to, before they sign in.
-- Only someone with the secret from the link can ask, so this tells them nothing they were not already sent.
create function public.jp_invitation_preview(hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('company',c.name,'role',i.role,'email',i.email,'expiresAt',i.expires_at,
  'state',case when i.accepted_at is not null then 'used' when i.revoked_at is not null then 'cancelled' when i.expires_at<=now() then 'expired' else 'open' end)
  from public.company_invitations i join public.companies c on c.id=i.company_id where hash ~ '^[0-9a-f]{64}$' and i.token_hash=hash),jsonb_build_object('state','unknown'))
$$;
revoke all on function public.jp_invitation_preview(text) from public;
grant execute on function public.jp_invitation_preview(text) to anon,authenticated;
commit;
