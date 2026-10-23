-- Completes a deletion request: de-identifies what must stay for the employer's records and removes the rest.
-- Called by the account-erasure Edge Function after it confirms the caller is a platform administrator.
begin;
create or replace function private.immutable_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 -- The only permitted change is redaction during an erasure, which sets this transaction-local flag.
 if current_setting('jobroles.erasure',true)='on' and new.profile=jsonb_build_object('redacted',true) then return new;end if;
 raise exception 'Submitted snapshots are immutable';
end$$;

create function public.jp_erase_account(target uuid,reviewer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare keys text[]; now_at timestamptz:=now(); request uuid;
begin
 if not exists(select 1 from private.platform_admins where user_id=reviewer and active) then raise exception 'Administrator required' using errcode='42501';end if;
 select id into request from public.privacy_requests where user_id=target and kind='deletion' and status in ('requested','reviewing') order by created_at limit 1 for update;
 if request is null then raise exception 'No open deletion request for this account' using errcode='22023';end if;
 perform set_config('jobroles.erasure','on',true);
 insert into public.application_stage_history(application_id,actor_id,from_state,to_state,reason)
  select id,reviewer,'submitted','withdrawn','Account erased at the applicant''s request' from public.applications where seeker_id=target and state='submitted';
 update public.applications set state='withdrawn',withdrawn_at=now_at,reinstatement_requested_at=null where seeker_id=target and state='submitted';
 update public.application_snapshots s set profile=jsonb_build_object('redacted',true),answers='{}',cover_letter='' from public.applications a where a.id=s.application_id and a.seeker_id=target;
 delete from public.application_drafts d using public.applications a where a.id=d.application_id and a.seeker_id=target;
 update public.application_messages set body='[Deleted at the sender''s request]' where sender_id=target;
 update public.seeker_profiles set resume_version_id=null where user_id=target;
 delete from public.seeker_profiles where user_id=target;
 select coalesce(array_agg(storage_key),'{}') into keys from public.resume_versions where user_id=target and deleted_at is null;
 update public.resume_versions set deleted_at=now_at,filename='deleted' where user_id=target;
 delete from public.saved_searches where user_id=target;
 delete from public.saved_jobs where user_id=target;
 delete from public.company_blocks where seeker_id=target;
 delete from public.application_preferences where user_id=target;
 update public.company_memberships set revoked_at=now_at where user_id=target and revoked_at is null;
 update private.notification_deliveries set recipient_email='erased',state=case when state in ('pending','sending') then 'skipped' else state end where recipient_id=target;
 update public.privacy_requests set status='responded',response='Your account and personal information were erased on '||to_char(now_at at time zone 'Australia/Melbourne','DD Mon YYYY')||'. Records employers must keep were de-identified.',requester_email='erased',reviewer_id=reviewer,updated_at=now_at where user_id=target and status in ('requested','reviewing');
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(reviewer,'account.erase','user',target,'Deletion request '||request);
 return jsonb_build_object('storageKeys',to_jsonb(keys));
end $$;
revoke all on function public.jp_erase_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.jp_erase_account(uuid,uuid) to service_role;
commit;
