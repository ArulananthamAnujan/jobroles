-- Invitation emails that are not going out no longer sit on "Sending" for ever. The Team screen says when an email
-- is delayed, and Admin > Setup status says why (the mail function is not running, or the mail provider refused).
begin;
create or replace function public.jp_invitation_mail_states(company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.owner_permission(company) then raise exception 'Owner required' using errcode='42501';end if;
 return coalesce((select jsonb_object_agg(i.id,case
   when m.state='accepted' then 'sent' when m.state='failed' then 'failed'
   when m.state in ('pending','sending') and (m.attempts>0 and m.last_error is not null or m.created_at<now()-interval '3 minutes') then 'delayed'
   when m.state in ('pending','sending') then 'sending' else 'none' end)
  from public.company_invitations i left join private.invitation_mail m on m.invitation_id=i.id
  where i.company_id=company and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'{}'::jsonb);
end $$;

-- For administrators: are invitation emails getting out?
create function public.jp_invitation_mail_health() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 return jsonb_build_object(
  'sent',(select count(*) from private.invitation_mail where state='accepted'),
  'failed',(select count(*) from private.invitation_mail where state='failed' and last_error is distinct from 'Invitation is no longer open'),
  'waiting',(select count(*) from private.invitation_mail where state in ('pending','sending')),
  -- Waiting more than three minutes without a single attempt: nothing is collecting the queue.
  'neverTried',(select count(*) from private.invitation_mail where state in ('pending','sending') and attempts=0 and created_at<now()-interval '3 minutes'),
  'oldestMinutes',(select floor(extract(epoch from now()-min(created_at))/60) from private.invitation_mail where state in ('pending','sending')),
  'lastError',(select last_error from private.invitation_mail where last_error is not null and last_error<>'Invitation is no longer open' order by coalesce(lease_until,created_at) desc limit 1));
end $$;
revoke all on function public.jp_invitation_mail_health() from public,anon;
grant execute on function public.jp_invitation_mail_health() to authenticated;
commit;
