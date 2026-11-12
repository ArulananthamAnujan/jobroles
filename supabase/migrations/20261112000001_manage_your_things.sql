-- People can remove and manage the things they added: resumes, draft applications, their reviews and other
-- contributions, team notes, draft jobs, and a team member's role. Each action checks that the thing belongs to the
-- person asking (or, for company things, that their role allows it).
begin;

-- Resumes ----------------------------------------------------------------------------------------------------------
-- A resume can be deleted unless it is attached to an application that is still in progress: the employer was sent
-- that version and still needs it. Withdrawn and finished applications do not hold it.
create function public.jp_delete_resume(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.resume_versions%rowtype; active integer;
begin
 select * into r from public.resume_versions where id=target and user_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Resume not found' using errcode='22023';end if;
 select count(*) into active from public.application_snapshots s join public.applications a on a.id=s.application_id
  where s.resume_version_id=target and a.state='submitted' and a.stage not in ('hired','rejected');
 if active>0 then raise exception 'This resume was sent with % in progress. Withdraw %, or keep the resume until % finished.',
  case when active=1 then 'an application that is still' else active||' applications that are still' end,
  case when active=1 then 'it' else 'them' end,case when active=1 then 'it has' else 'they have' end using errcode='22023';end if;
 update public.application_drafts set resume_version_id=null where resume_version_id=target;
 update public.application_preferences set resume_version_id=null where resume_version_id=target and user_id=auth.uid();
 update public.resume_versions set deleted_at=now() where id=target;
 return jsonb_build_object('storageKey',r.storage_key);
end $$;
revoke all on function public.jp_delete_resume(uuid) from public,anon;
grant execute on function public.jp_delete_resume(uuid) to authenticated;
-- The file itself is removed after the resume is deleted. Only the owner's own folder, and never a file whose resume still exists.
create policy resume_read_own_folder on storage.objects for select to authenticated using(bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy resume_delete_removed on storage.objects for delete to authenticated using(bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text
 and not exists(select 1 from public.resume_versions v where v.storage_key=name and v.deleted_at is null));

-- Draft applications -----------------------------------------------------------------------------------------------
create function public.jp_discard_draft(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.applications where id=target and seeker_id=auth.uid() and state='draft') then raise exception 'Draft not found' using errcode='22023';end if;
 delete from public.application_drafts where application_id=target;
 delete from public.applications where id=target and seeker_id=auth.uid() and state='draft';
 return true;
end $$;
revoke all on function public.jp_discard_draft(uuid) from public,anon;
grant execute on function public.jp_discard_draft(uuid) to authenticated;

-- Reviews, salaries, interview experiences, questions and answers the person wrote -------------------------------------
create function public.jp_my_contributions() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'companyId',r.company_id,'company',c.name,'title',r.title,'rating',r.rating,'status',r.status,'reason',r.moderation_reason,'createdAt',r.created_at) order by r.created_at desc)
   from public.company_reviews r join public.companies c on c.id=r.company_id where r.author_id=auth.uid()),'[]'::jsonb),
  'salaries',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'companyId',s.company_id,'company',c.name,'title',s.job_title,'pay',s.pay,'period',s.period,'location',s.location,'createdAt',s.created_at) order by s.created_at desc)
   from public.salary_reports s left join public.companies c on c.id=s.company_id where s.author_id=auth.uid()),'[]'::jsonb),
  'interviews',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'companyId',i.company_id,'company',c.name,'title',i.job_title,'status',i.status,'reason',i.moderation_reason,'createdAt',i.created_at) order by i.created_at desc)
   from public.company_interviews i join public.companies c on c.id=i.company_id where i.author_id=auth.uid()),'[]'::jsonb),
  'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'companyId',q.company_id,'company',c.name,'title',q.body,'status',q.status,'reason',q.moderation_reason,'createdAt',q.created_at) order by q.created_at desc)
   from public.company_questions q join public.companies c on c.id=q.company_id where q.author_id=auth.uid()),'[]'::jsonb),
  'answers',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'companyId',q.company_id,'company',c.name,'title',a.body,'status',a.status,'reason',a.moderation_reason,'createdAt',a.created_at) order by a.created_at desc)
   from public.company_answers a join public.company_questions q on q.id=a.question_id join public.companies c on c.id=q.company_id where a.author_id=auth.uid()),'[]'::jsonb))
$$;
revoke all on function public.jp_my_contributions() from public,anon;
grant execute on function public.jp_my_contributions() to authenticated;
create function public.jp_delete_contribution(kind text,target uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare gone integer:=0;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501';end if;
 begin
  case kind
  when 'review' then delete from public.company_reviews where id=target and author_id=auth.uid();
  when 'salary' then delete from public.salary_reports where id=target and author_id=auth.uid();
  when 'interview' then delete from public.company_interviews where id=target and author_id=auth.uid();
  when 'question' then delete from public.company_questions where id=target and author_id=auth.uid();
  when 'answer' then delete from public.company_answers where id=target and author_id=auth.uid();
  else raise exception 'Unknown kind' using errcode='22023';
  end case;
  get diagnostics gone=row_count;
 exception when foreign_key_violation then raise exception 'This cannot be deleted right now. Contact support and we will remove it for you.' using errcode='22023';
 end;
 if gone=0 then raise exception 'Not found' using errcode='22023';end if;
 return true;
end $$;
revoke all on function public.jp_delete_contribution(text,uuid) from public,anon;
grant execute on function public.jp_delete_contribution(text,uuid) to authenticated;

-- Team notes ------------------------------------------------------------------------------------------------------------
create function public.jp_delete_note(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 delete from public.application_notes where id=target and author_id=auth.uid();
 if not found then raise exception 'You can delete only notes you wrote' using errcode='42501';end if;
 return true;
end $$;
revoke all on function public.jp_delete_note(uuid) from public,anon;
grant execute on function public.jp_delete_note(uuid) to authenticated;

-- Draft jobs --------------------------------------------------------------------------------------------------------------
-- Only a job that has never been sent for review can be deleted. Anything published is closed instead, so links,
-- applications and statistics keep working.
create function public.jp_delete_draft_job(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.jobs where id=target and state='draft' and published_at is null) or not private.job_permission(target,'edit') then raise exception 'Only your own drafts can be deleted. Close a published job instead.' using errcode='22023';end if;
 if exists(select 1 from public.applications where job_id=target) or exists(select 1 from public.job_feed_items where job_id=target) then raise exception 'This draft has applications or comes from a feed, so it cannot be deleted. Close it instead.' using errcode='22023';end if;
 begin
  delete from public.screening_questions where job_id=target;
  delete from public.job_assignments where job_id=target;
  delete from public.jobs where id=target;
 exception when foreign_key_violation then raise exception 'This draft is linked to other records, so it cannot be deleted. Close it instead.' using errcode='22023';
 end;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'job.delete_draft','job',target,'draft deleted');
 return true;
end $$;
revoke all on function public.jp_delete_draft_job(uuid) from public,anon;
grant execute on function public.jp_delete_draft_job(uuid) to authenticated;

-- Team roles ----------------------------------------------------------------------------------------------------------------
-- An owner can switch a colleague between recruiter and hiring manager. Owners are not changed here.
create function public.jp_change_role(company uuid,member uuid,new_role text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.owner_permission(company) then raise exception 'Company owner required' using errcode='42501';end if;
 if new_role not in ('recruiter','hiring_manager') then raise exception 'Choose recruiter or hiring manager' using errcode='22023';end if;
 update public.company_memberships set role=new_role::public.company_role where company_id=company and user_id=member and revoked_at is null and role<>'owner';
 if not found then raise exception 'Team member not found' using errcode='22023';end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'member.role','company',company,new_role);
 return true;
end $$;
revoke all on function public.jp_change_role(uuid,uuid,text) from public,anon;
grant execute on function public.jp_change_role(uuid,uuid,text) to authenticated;
commit;
