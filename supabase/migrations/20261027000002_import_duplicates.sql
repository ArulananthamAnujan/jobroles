-- Bulk import skips jobs the company already has open (same title and a shared location, ignoring case and
-- punctuation), so uploading the same spreadsheet twice never creates duplicate listings. The employer can turn
-- this off for roles they really do want twice.
begin;
drop function public.jp_bulk_import_jobs(uuid,jsonb,boolean);

create function private.match_text(value text) returns text language sql immutable set search_path='' as $$
 select trim(regexp_replace(lower(coalesce(value,'')),'[^a-z0-9]+',' ','g'))
$$;

create function public.jp_bulk_import_jobs(company uuid,rows jsonb,submit boolean default false,skip_duplicates boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; i integer:=0; saved jsonb; results jsonb:='[]'::jsonb; ok integer:=0; skipped integer:=0; locations jsonb;
begin
 if not exists(select 1 from public.company_memberships m where m.company_id=company and m.user_id=auth.uid() and m.revoked_at is null and m.role in ('owner','recruiter')) then raise exception 'Owners and recruiters can import jobs' using errcode='42501';end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'Import between 1 and 200 jobs at a time' using errcode='22023';end if;
 for r in select * from jsonb_array_elements(rows) loop
  i:=i+1;
  locations:=coalesce((select jsonb_agg(trim(x)) from jsonb_array_elements_text(coalesce(r->'locations','[]')) x where trim(x)<>''),'[]');
  -- Rows saved earlier in this same import are already in the table, so repeats within one file are caught too.
  if skip_duplicates and exists(select 1 from public.jobs j where j.company_id=company and j.state in ('draft','pending_review','live','paused') and (j.expires_at is null or j.expires_at>now())
     and private.match_text(j.title)=private.match_text(r->>'title')
     and exists(select 1 from public.job_locations l join jsonb_array_elements_text(locations) x on private.match_text(l.label)=private.match_text(x) where l.job_id=j.id)) then
   results:=results||jsonb_build_object('row',i,'ok',false,'duplicate',true,'error','You already have this job open, so it was skipped');skipped:=skipped+1;continue;
  end if;
  begin
   saved:=private.jp_command('job.save',jsonb_build_object('companyId',company,'title',left(trim(r->>'title'),160),'description',r->>'description','locations',locations,
    'type',r->>'type','arrangement',r->>'arrangement','min',r->>'min','max',r->>'max','period',coalesce(nullif(r->>'period',''),'year'),'sponsorship',coalesce((r->>'sponsorship')::boolean,false),'submit',submit,
    'screening',nullif(trim(coalesce(r->>'screening','')),'')));
   if coalesce(jsonb_array_length(r->'benefits'),0)>0 or nullif(r->>'startDate','') is not null or nullif(r->>'externalApplyUrl','') is not null then
    perform public.jp_job_extras((saved->>'id')::uuid,jsonb_build_object('benefits',coalesce(r->'benefits','[]'),'startDate',coalesce(r->>'startDate',''),'externalApplyUrl',coalesce(r->>'externalApplyUrl','')));
   end if;
   results:=results||jsonb_build_object('row',i,'ok',true,'id',saved->>'id','state',saved->>'state');ok:=ok+1;
  exception when others then
   results:=results||jsonb_build_object('row',i,'ok',false,'error',case when sqlstate in ('22023','42501','23514','22P02','23502') then sqlerrm else 'This row could not be saved' end);
  end;
 end loop;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,reason) values(auth.uid(),'jobs.import','company',company,format('%s of %s rows, %s duplicates skipped',ok,i,skipped));
 return jsonb_build_object('saved',ok,'failed',i-ok-skipped,'skipped',skipped,'results',results);
end $$;

revoke all on function public.jp_bulk_import_jobs(uuid,jsonb,boolean,boolean),private.match_text(text) from public,anon;
grant execute on function public.jp_bulk_import_jobs(uuid,jsonb,boolean,boolean) to authenticated;
commit;
