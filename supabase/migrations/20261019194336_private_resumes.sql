begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('resumes','resumes',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
-- No SELECT/UPDATE/DELETE policy: uploaded files cannot be read through public or
-- signed URLs. Every download goes through a fresh user-scoped permission check.
create policy resume_upload_own on storage.objects for insert to authenticated with check(bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create function private.register_resume(object_key text,original_name text,content_type text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid; next_version integer;
begin
 if actor is null or split_part(object_key,'/',1)<>actor::text then raise exception 'Resume access denied' using errcode='42501';end if;
 if length(original_name) not between 1 and 180 then raise exception 'Invalid filename' using errcode='22023';end if;
 perform 1 from public.seeker_profiles where user_id=actor for update;
 if not found then raise exception 'Complete your profile first' using errcode='22023';end if;
 if not exists(select 1 from storage.objects where bucket_id='resumes' and name=object_key and owner_id=actor::text) then raise exception 'Uploaded file not found' using errcode='42501';end if;
 select coalesce(max(version),0)+1 into next_version from public.resume_versions where user_id=actor;
 insert into public.resume_versions(user_id,version,storage_key,filename,mime_type) values(actor,next_version,object_key,original_name,content_type) returning id into target;
 update public.seeker_profiles set resume_version_id=target,updated_at=now() where user_id=actor;
 return target;
end$$;
revoke all on function private.register_resume(text,text,text) from public;
grant execute on function private.register_resume(text,text,text) to authenticated;
create function public.jp_register_resume(object_key text,original_name text,content_type text) returns uuid language sql security invoker set search_path='' as $$select private.register_resume(object_key,original_name,content_type)$$;
revoke all on function public.jp_register_resume(text,text,text) from public,anon;
grant execute on function public.jp_register_resume(text,text,text) to authenticated;
commit;
