-- Security hardening after the October 2026 review.
begin;

-- 1. Expected screening answers are for the hiring team only. Seekers and the public keep the questions.
revoke select on public.screening_questions from anon,authenticated;
grant select(id,job_id,question,required,position) on public.screening_questions to anon,authenticated;
create function public.jp_screening_rules(target uuid) returns table(id uuid,must_have boolean,expected_answer text)
language sql stable security definer set search_path='' as $$
 select q.id,q.must_have,q.expected_answer from public.screening_questions q
 where q.job_id=target and (private.job_permission(target,'read') or private.is_admin())
$$;
revoke all on function public.jp_screening_rules(uuid) from public,anon;
grant execute on function public.jp_screening_rules(uuid) to authenticated;

-- 2. Resumes carry a malware-scan status. Files uploaded before this migration are marked unscanned.
alter table public.resume_versions add column scan_status text not null default 'pending'
 check(scan_status in ('pending','clean','infected','unscanned'));
alter table public.resume_versions add column scanned_at timestamptz;
update public.resume_versions set scan_status='unscanned';
create function public.jp_record_resume_scan(target uuid,result text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if result not in ('clean','infected') then raise exception 'Invalid scan result' using errcode='22023';end if;
 update public.resume_versions set scan_status=result,scanned_at=now() where id=target and scan_status='pending';
 return found;
end $$;
revoke all on function public.jp_record_resume_scan(uuid,text) from public,anon,authenticated;
grant execute on function public.jp_record_resume_scan(uuid,text) to service_role;
grant select(id,storage_key,scan_status,created_at) on public.resume_versions to service_role;

-- 3. Withdrawing an application ends the hiring team's access to the resume it carried.
create or replace function private.resume_access(target uuid) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.resume_versions r where r.id=target and r.deleted_at is null and r.scan_status<>'infected' and (r.user_id=auth.uid() or exists(select 1 from public.application_snapshots s join public.applications a on a.id=s.application_id where s.resume_version_id=r.id and a.state='submitted' and private.job_permission(a.job_id,'read'))))
$$;
commit;
