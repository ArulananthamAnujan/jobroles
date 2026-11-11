-- Resume downloads no longer depend on the separately deployed resume-download function.
-- Until now the files could only be read with the service key inside that function, so on a project where the
-- function had not been deployed nobody could open a resume: not the applicant, and not the employer they applied to.
-- This lets the signed-in person read a resume file directly when, and only when, the existing rules already let
-- them see that resume: it is their own, or it was submitted with an application to a job their role covers and
-- the application has not been withdrawn (private.resume_access). A file that failed its malware check is never
-- readable. To also hold files back from employers until a scan has passed, set once:
--   insert into private.settings(key,value) values('resume_scan_required','true');
begin;
create function private.resume_file_readable(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.resume_versions v
  where v.storage_key=object_name and v.deleted_at is null and v.scan_status<>'infected'
   and (v.user_id=auth.uid()
    or (private.resume_access(v.id) and (v.scan_status='clean' or coalesce(private.setting('resume_scan_required')#>>'{}','false')<>'true'))))
$$;
revoke all on function private.resume_file_readable(text) from public,anon;
grant execute on function private.resume_file_readable(text) to authenticated;
create policy resume_read_authorised on storage.objects for select to authenticated using(bucket_id='resumes' and private.resume_file_readable(name));
commit;
