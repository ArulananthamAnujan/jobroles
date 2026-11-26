-- Reviewing many applicants quickly: search inside resumes and sort by how well each one matches the job.
--
-- The text of each resume is kept in a private table so it can be searched. It is stored when a resume is uploaded;
-- for resumes uploaded before this update, the site reads them the first time an employer opens that job's
-- applicants. Only people who may already read a resume (its owner, or the team of a job it was submitted to) can
-- store its text, and someone other than the owner can only fill in text that is missing, never replace it.
--
-- The match score is a plain keyword comparison, not AI: the share of the job's key words (from its title and
-- description) that appear in the applicant's resume, headline and skills, with the title's words counting triple.
-- The matched words are returned so the recruiter can see why.
begin;

create table private.resume_text(
 resume_version_id uuid primary key references public.resume_versions(id) on delete cascade,
 body text not null,tsv tsvector generated always as (to_tsvector('english',body)) stored,
 indexed_by uuid,indexed_at timestamptz not null default now());
create index resume_text_search on private.resume_text using gin(tsv);
alter table private.resume_text enable row level security;
revoke all on private.resume_text from public,anon,authenticated;

create function public.jp_index_resume(target uuid,body text) returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();mine boolean;clean text:=left(coalesce(body,''),120000);
begin
 if actor is null or not private.resume_access(target) then raise exception 'Resume not found' using errcode='42501';end if;
 select r.user_id=actor into mine from public.resume_versions r where r.id=target;
 if mine then
  insert into private.resume_text(resume_version_id,body,indexed_by) values(target,clean,actor)
  on conflict(resume_version_id) do update set body=excluded.body,indexed_by=excluded.indexed_by,indexed_at=now();
 else
  insert into private.resume_text(resume_version_id,body,indexed_by) values(target,clean,actor) on conflict(resume_version_id) do nothing;
 end if;
 return true;
end $$;
revoke all on function public.jp_index_resume(uuid,text) from public,anon;
grant execute on function public.jp_index_resume(uuid,text) to authenticated;

-- Resumes submitted to a job whose text has not been read yet.
create function public.jp_unindexed_resumes(target uuid) returns table(resume_version_id uuid) language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 if not private.job_permission(target,'read') then raise exception 'Job access denied' using errcode='42501';end if;
 return query select distinct s.resume_version_id from public.applications a join public.application_snapshots s on s.application_id=a.id
  join public.resume_versions r on r.id=s.resume_version_id
  where a.job_id=target and a.state='submitted' and r.deleted_at is null and r.scan_status<>'infected'
   and not exists(select 1 from private.resume_text t where t.resume_version_id=s.resume_version_id) limit 500;
end $$;
revoke all on function public.jp_unindexed_resumes(uuid) from public,anon;
grant execute on function public.jp_unindexed_resumes(uuid) to authenticated;

-- Words that appear in almost every job ad and say nothing about the role.
create function private.filler_word(w text) returns boolean language sql immutable set search_path='' as $$
 select w = any(array['team','teams','work','working','works','role','roles','job','jobs','experience','experienced','year','years','join','joining','need','needs','needed','require','required','requires','requirement','requirements','strong','good','great','excellent','ability','able','skills','skill','day','days','week','weeks','time','full','part','per','include','includes','including','across','within','about','what','youll','you','your','our','their','they','them','this','that','with','from','have','has','will','can','must','should','would','and','the','for','are','who','all','new','make','help','keep','ensure','provide','support','position','opportunity','company','business','apply','application','offer','offers','successful','candidate','candidates','looking','seeking','based','staff','people','person','level','high','well','also','more','most','some','any','one','two','three','least','minimum','current','valid','relevant','similar','previous','preferred','essential','desirable','duties','responsibilities','benefits','salary','hour','hours','annual','plus','super','roster','rostered','shift','shifts'])
$$;

-- For one job: each applicant's match score and matched words, and (when a search is given) who matches it and where.
create function public.jp_applicant_insights(target uuid,search text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j public.jobs;q tsquery;needle text:=nullif(trim(coalesce(search,'')),'');result jsonb;
begin
 if not private.job_permission(target,'read') then raise exception 'Job access denied' using errcode='42501';end if;
 select * into j from public.jobs where id=target;
 if needle is not null then begin q:=websearch_to_tsquery('english',left(needle,200));exception when others then q:=null;end;end if;
 with words as (
  select w,3 as weight from regexp_split_to_table(lower(j.title),'[^a-z0-9]+') w where length(w)>=3
  union all select w,1 from regexp_split_to_table(lower(left(j.description,20000)),'[^a-z0-9]+') w where length(w)>=4),
 lexed as (select w,weight,(select l.lexeme from unnest(to_tsvector('english',w)) l limit 1) as lexeme from words where not private.filler_word(w)),
 ranked as (select lexeme,max(weight) as weight,(array_agg(w order by length(w),w))[1] as word,count(*) as uses from lexed where lexeme is not null and lexeme ~ '^[a-z0-9]+$' group by lexeme),
 -- Every word from the title, and the thirty most-used words from the description.
 terms as (select lexeme,weight,word from (select *,row_number() over(partition by weight order by uses desc,word) as n from ranked) x where weight=3 or n<=30),
 total as (select coalesce(sum(weight),0) as w from terms),
 people as (
  select a.id,a.state,t.body,
   coalesce(t.tsv,''::tsvector)||to_tsvector('english',coalesce(s.profile->>'headline','')||' '||coalesce((select string_agg(x,' ') from jsonb_array_elements_text(case when jsonb_typeof(s.profile->'skills')='array' then s.profile->'skills' else '[]'::jsonb end) x),'')) as tsv,
   t.resume_version_id is not null as indexed,
   coalesce(s.profile->>'full_name','')||' '||coalesce(s.profile->>'headline','')||' '||coalesce(s.profile->>'location','') as card
  from public.applications a join public.application_snapshots s on s.application_id=a.id
  left join private.resume_text t on t.resume_version_id=s.resume_version_id
  where a.job_id=target and a.state='submitted'),
 scored as (
  select p.id,p.indexed,
   (select coalesce(sum(t.weight),0) from terms t where p.tsv @@ to_tsquery('simple',t.lexeme)) as got,
   (select coalesce(jsonb_agg(t.word order by t.weight desc,t.word),'[]'::jsonb) from (select * from terms t where p.tsv @@ to_tsquery('simple',t.lexeme) order by t.weight desc,t.word limit 8) t) as matched,
   case when needle is null then null
        else (q is not null and numnode(q)>0 and p.tsv @@ q) or position(lower(needle) in lower(p.card))>0 or (p.body is not null and position(lower(needle) in lower(p.body))>0) end as hit,
   case when needle is not null and p.body is not null and q is not null and numnode(q)>0 and p.tsv @@ q
        then ts_headline('english',left(p.body,30000),q,'MaxFragments=1,MaxWords=20,MinWords=8,StartSel=[[,StopSel=]]')
        when needle is not null and p.body is not null and position(lower(needle) in lower(p.body))>0
        then regexp_replace(substr(p.body,greatest(1,position(lower(needle) in lower(p.body))-60),160),'\s+',' ','g') end as snippet
  from people p)
 select jsonb_build_object(
  'terms',(select coalesce(jsonb_agg(word order by weight desc,word),'[]'::jsonb) from terms),
  'waiting',(select count(*) from people where not indexed),
  'applicants',coalesce((select jsonb_object_agg(s.id,jsonb_strip_nulls(jsonb_build_object(
    'score',case when (select w from total)>0 then round(100.0*s.got/(select w from total)) end,
    'matched',s.matched,'read',s.indexed,'hit',s.hit,'snippet',s.snippet))) from scored s),'{}'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.jp_applicant_insights(uuid,text) from public,anon;
grant execute on function public.jp_applicant_insights(uuid,text) to authenticated;
commit;
