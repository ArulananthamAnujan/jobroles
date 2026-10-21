begin;
-- Applicants retain the job description after a vacancy closes. Lookup is private
-- to avoid recursion between application and job read policies.
create function private.applied_to_job(target uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.applications where job_id=target and seeker_id=auth.uid())$$;
revoke all on function private.applied_to_job(uuid) from public;
grant execute on function private.applied_to_job(uuid) to authenticated;
create policy jobs_applied on public.jobs for select to authenticated using(private.applied_to_job(id));
create function private.team_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; invite public.company_invitations%rowtype; job public.jobs%rowtype; member uuid; email_value text;
begin
 if actor is null then raise exception 'Sign in required' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023';end if;
 if action='invite' then
  target:=(payload->>'companyId')::uuid;
  if not private.owner_permission(target) then raise exception 'Owner required' using errcode='42501';end if;
  email_value:=lower(trim(payload->>'email'));
  if email_value is null or length(email_value)>254 or email_value not like '%@%.%' or (payload->>'hash') !~ '^[0-9a-f]{64}$' or payload->>'hash' is null or coalesce(payload->>'role','') not in ('recruiter','hiring_manager') then raise exception 'Invalid invitation' using errcode='22023';end if;
  update public.company_invitations set revoked_at=now() where company_id=target and email=email_value and accepted_at is null and revoked_at is null;
  insert into public.company_invitations(company_id,email,role,token_hash) values(target,email_value,(payload->>'role')::public.company_role,payload->>'hash') returning * into invite;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'team.invite','company',target,'Owner created invitation');
  return jsonb_build_object('id',invite.id,'expiresAt',invite.expires_at);
 elsif action='accept' then
  select * into invite from public.company_invitations where token_hash=payload->>'hash' for update;
  if not found or invite.revoked_at is not null or invite.accepted_at is not null or invite.expires_at<=now() then raise exception 'Invitation is invalid or expired' using errcode='22023';end if;
  if not exists(select 1 from auth.users where id=actor and lower(email)=invite.email and email_confirmed_at is not null) then raise exception 'Sign in with the invited, confirmed email' using errcode='42501';end if;
  if exists(select 1 from public.company_memberships where company_id=invite.company_id and user_id=actor and revoked_at is null) then raise exception 'Already an active team member' using errcode='22023';end if;
  insert into public.company_memberships(company_id,user_id,role) values(invite.company_id,actor,invite.role) on conflict(company_id,user_id) do update set role=excluded.role,revoked_at=null;
  -- Previous assignments must not silently reactivate when a removed user returns.
  delete from public.job_assignments where user_id=actor and job_id in(select id from public.jobs where company_id=invite.company_id);
  update public.company_invitations set accepted_at=now() where id=invite.id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'team.accept','company',invite.company_id,'Email-matched invitation accepted');
  return jsonb_build_object('companyId',invite.company_id);
 elsif action='assign' then
  select * into job from public.jobs where id=(payload->>'jobId')::uuid;
  if not found or not private.owner_permission(job.company_id) then raise exception 'Owner required' using errcode='42501';end if;
  member:=(payload->>'userId')::uuid;
  if not exists(select 1 from public.company_memberships where company_id=job.company_id and user_id=member and revoked_at is null) then raise exception 'Active company member required' using errcode='42501';end if;
  if payload->>'assigned'='true' then insert into public.job_assignments values(job.id,member) on conflict do nothing;
  elsif payload->>'assigned'='false' then delete from public.job_assignments where job_id=job.id and user_id=member;
  else raise exception 'Assignment choice required' using errcode='22023';end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(actor,'team.assignment','job',job.id,'Owner changed job assignment');
  return jsonb_build_object('saved',true);
 else raise exception 'Unknown team action' using errcode='22023';end if;
end$$;
revoke all on function private.team_command(text,jsonb) from public;
grant execute on function private.team_command(text,jsonb) to authenticated;
create function public.jp_team_command(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.team_command(action,payload)$$;
revoke all on function public.jp_team_command(text,jsonb) from public,anon;
grant execute on function public.jp_team_command(text,jsonb) to authenticated;
commit;
