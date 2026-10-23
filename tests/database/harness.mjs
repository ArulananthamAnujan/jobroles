// Shared in-memory Postgres for feature tests: Supabase-like roles, every migration, and a small seed.
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
export const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const ids={owner:uid(1),seeker:uid(2),other:uid(3),recruiter:uid(4),manager:uid(5),admin:uid(6),company:uid(10),job:uid(11),resume:uid(12),question:uid(13),foreignCompany:uid(14),foreignJob:uid(15)};
export async function createDb(){
 const db=new PGlite();
 const as=async(user,fn)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user==='service'?'service_role':user?'authenticated':'anon'}`);if(user==='service')await db.query("select set_config('request.jwt.claim.sub','',false)");return fn();};
 const rows=(user,sql,params=[])=>as(user,async()=>(await db.query(sql,params)).rows);
 const command=(user,action,payload)=>as(user,async()=>(await db.query('select public.jp_command($1,$2::jsonb) as result',[action,JSON.stringify(payload)])).rows[0].result);
 const admin=async(sql,params=[])=>{await db.exec('reset role');return (await db.query(sql,params)).rows;};
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
 for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 const {owner,seeker,other,recruiter,manager,admin:adminId,company,job,resume,question,foreignCompany,foreignJob}=ids;
 await admin(`insert into auth.users(id,email) values($1,'owner@example.test'),($2,'seeker@example.test'),($3,'other@example.test'),($4,'recruiter@example.test'),($5,'manager@example.test'),($6,'admin@example.test')`,[owner,seeker,other,recruiter,manager,adminId]);
 await admin(`insert into public.companies(id,name,verified_at) values($1,'Bayside',now()),($2,'Other company',now())`,[company,foreignCompany]);
 await admin(`insert into public.company_memberships(company_id,user_id,role) values($1,$2,'owner'),($1,$3,'recruiter'),($1,$4,'hiring_manager'),($5,$6,'owner')`,[company,owner,recruiter,manager,foreignCompany,other]);
 for(const [id,cid] of [[job,company],[foreignJob,foreignCompany]])await admin(`insert into public.jobs(id,company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,published_at,expires_at) values($1,$2,'Registered Nurse','A meaningful nursing role with a supportive clinical team in Frankston.','live','Full-time','on_site',90000,105000,'year',now(),now()+interval '30 days')`,[id,cid]);
 await admin(`insert into public.job_locations(job_id,label) values($1,'Frankston VIC'),($2,'Sydney NSW')`,[job,foreignJob]);
 await admin(`insert into public.job_assignments values($1,$2),($1,$3)`,[job,recruiter,manager]);
 await admin(`insert into public.screening_questions(id,job_id,question,must_have,expected_answer) values($1,$2,'Clinical experience?',true,'Yes')`,[question,job]);
 await admin(`insert into public.resume_versions(id,user_id,version,storage_key,filename,mime_type) values($1,$2,1,'test/resume.pdf','resume.pdf','application/pdf')`,[resume,seeker]);
 await admin('insert into private.platform_admins(user_id) values($1)',[adminId]);
 await admin(`insert into public.seeker_profiles(user_id,full_name,email) values($1,'Sam Seeker','seeker@example.test')`,[seeker]);
 return {db,as,rows,command,admin};
}
