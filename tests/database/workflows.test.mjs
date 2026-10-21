import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),seeker=uid(2),other=uid(3),recruiter=uid(4),manager=uid(5),admin=uid(6);
const company=uid(10),job=uid(11),resume=uid(12),question=uid(13),foreignCompany=uid(14),foreignJob=uid(15);
const db=new PGlite();
async function as(user,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(`set role ${user?'authenticated':'anon'}`);return fn();}
async function command(user,action,payload){return as(user,async()=>{const r=await db.query('select public.jp_command($1,$2::jsonb) as result',[action,JSON.stringify(payload)]);return r.rows[0].result;});}
async function rows(user,sql,params=[]){return as(user,async()=>(await db.query(sql,params)).rows);}
async function setup(){
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
 for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
 await db.query(`insert into auth.users(id,email) values($1,'owner@example.test'),($2,'seeker@example.test'),($3,'other@example.test'),($4,'recruiter@example.test'),($5,'manager@example.test'),($6,'admin@example.test')`,[owner,seeker,other,recruiter,manager,admin]);
 await db.query(`insert into public.companies(id,name,verified_at) values($1,'Bayside',now()),($2,'Other company',now())`,[company,foreignCompany]);
 await db.query(`insert into public.company_memberships(company_id,user_id,role) values($1,$2,'owner'),($1,$3,'recruiter'),($1,$4,'hiring_manager'),($5,$6,'owner')`,[company,owner,recruiter,manager,foreignCompany,other]);
 for(const [id,cid] of [[job,company],[foreignJob,foreignCompany]])await db.query(`insert into public.jobs(id,company_id,title,description,state,employment_type,arrangement,published_at,expires_at) values($1,$2,'Registered Nurse','A meaningful nursing role with a supportive clinical team.','live','Full-time','on_site',now(),now()+interval '30 days')`,[id,cid]);
 await db.query(`insert into public.job_assignments values($1,$2),($1,$3)`,[job,recruiter,manager]);
 await db.query(`insert into public.screening_questions(id,job_id,question,must_have,expected_answer) values($1,$2,'Clinical experience?',true,'Yes')`,[question,job]);
 await db.query(`insert into public.resume_versions(id,user_id,version,storage_key,filename,mime_type) values($1,$2,1,'test/resume.pdf','resume.pdf','application/pdf')`,[resume,seeker]);
 await db.query('insert into private.platform_admins(user_id) values($1)',[admin]);
}
test('PostgreSQL workflows and row-level security',async t=>{
 await setup();let application;
 await t.test('privacy requests derive identity and are hidden from employers',async()=>{
  await command(seeker,'profile.save',{name:'Privacy tester',searchable:true});
  const [{result}]=await rows(seeker,"select jp_privacy_command('create',$1::jsonb) as result",[JSON.stringify({kind:'deletion',detail:'Please delete my account and personal data.',userId:owner})]);
  const [request]=await rows(seeker,'select * from privacy_requests');
  assert.equal(request.id,result.id);assert.equal(request.user_id,seeker);assert.equal(request.requester_email,'seeker@example.test');
  assert.equal((await rows(seeker,'select searchable from seeker_profiles'))[0].searchable,false);
  assert.equal((await rows(owner,'select * from privacy_requests')).length,0);
  assert.equal((await rows(admin,'select * from privacy_requests')).length,1);
 });
 await t.test('duplicate privacy requests and foreign cancellation are denied',async()=>{
  const [request]=await rows(seeker,'select id from privacy_requests');
  await assert.rejects(()=>rows(seeker,"select jp_privacy_command('create',$1::jsonb)",[JSON.stringify({kind:'deletion',detail:'Please delete my account again.'})]),/open request/);
  await assert.rejects(()=>rows(other,"select jp_privacy_command('cancel',$1::jsonb)",[JSON.stringify({id:request.id})]),/cannot be cancelled/);
  await assert.rejects(()=>rows(null,"select jp_privacy_command('create',$1::jsonb)",[JSON.stringify({kind:'access',detail:'Please send my information.'})]),/permission denied/);
 });
 await t.test('only administrator can respond and response does not pretend erasure',async()=>{
  const [request]=await rows(seeker,'select id from privacy_requests');
  const payload=JSON.stringify({id:request.id,status:'reviewing',response:'We are reviewing the requested deletion and retention requirements.'});
  await assert.rejects(()=>rows(owner,"select jp_privacy_command('respond',$1::jsonb)",[payload]),/Administrator required/);
  await rows(admin,"select jp_privacy_command('respond',$1::jsonb)",[payload]);
  assert.equal((await rows(seeker,'select status from privacy_requests'))[0].status,'reviewing');
  assert.equal((await rows(seeker,'select * from seeker_profiles')).length,1);
  await rows(seeker,"select jp_privacy_command('cancel',$1::jsonb)",[JSON.stringify({id:request.id})]);
  assert.equal((await rows(seeker,'select status from privacy_requests'))[0].status,'cancelled');
  await assert.rejects(()=>rows(admin,"select jp_privacy_command('respond',$1::jsonb)",[payload]),/unavailable/);
 });
 await t.test('saved searches are private and cannot enable undelivered email alerts',async()=>{
  const result=await rows(seeker,"select jp_launch_command('search.save',$1::jsonb) as result",[JSON.stringify({filters:{q:'Nurse',location:'Melbourne'}})]);
  const search=result[0].result.id;
  assert.equal((await rows(seeker,'select * from saved_searches')).length,1);
  assert.equal((await rows(other,'select * from saved_searches')).length,0);
  assert.equal((await rows(seeker,'select frequency from saved_searches'))[0].frequency,'off');
  await rows(other,"select jp_launch_command('search.delete',$1::jsonb)",[JSON.stringify({id:search})]);
  assert.equal((await rows(seeker,'select * from saved_searches')).length,1);
  await assert.rejects(()=>rows(seeker,"select jp_launch_command('search.save',$1::jsonb)",[JSON.stringify({filters:{userId:owner}})]),/Invalid search field/);
  await rows(seeker,"select jp_launch_command('search.delete',$1::jsonb)",[JSON.stringify({id:search})]);
  assert.equal((await rows(seeker,'select * from saved_searches')).length,0);
 });
 await t.test('job reports are private, duplicate-protected and admin-only to resolve',async()=>{
  const payload=JSON.stringify({jobId:job,reason:'Please investigate this suspicious listing.'});
  const [{result}]=await rows(seeker,"select jp_launch_command('job.report',$1::jsonb) as result",[payload]);
  assert.equal((await rows(owner,'select * from job_reports')).length,0);
  assert.equal((await rows(seeker,'select * from job_reports')).length,1);
  assert.equal((await rows(admin,'select * from job_reports')).length,1);
  await assert.rejects(()=>rows(seeker,"select jp_launch_command('job.report',$1::jsonb)",[payload]),/already awaiting/);
  const resolution=JSON.stringify({id:result.id,reason:'Verified report; role paused for review.',pause:true});
  await assert.rejects(()=>rows(owner,"select jp_launch_command('report.resolve',$1::jsonb)",[resolution]),/Admin required/);
  await rows(admin,"select jp_launch_command('report.resolve',$1::jsonb)",[resolution]);
  assert.equal((await rows(null,'select * from jobs where id=$1',[job])).length,0);
  assert.equal((await rows(seeker,'select state from job_reports'))[0].state,'resolved');
  await command(owner,'job.state',{id:job,state:'pending_review'});await command(admin,'job.review',{id:job,decision:'approve',reason:'Review completed'});
 });
 await t.test('saved jobs belong to the actor and removal is idempotent',async()=>{
  await command(seeker,'saved.toggle',{jobId:job,saved:true});
  await command(seeker,'saved.toggle',{jobId:job,saved:true});
  assert.equal((await rows(seeker,'select * from saved_jobs')).length,1);
  assert.equal((await rows(other,'select * from saved_jobs')).length,0);
  await command(other,'saved.toggle',{jobId:job,saved:false});
  assert.equal((await rows(seeker,'select * from saved_jobs')).length,1);
  await command(seeker,'saved.toggle',{jobId:job,saved:false});
 });
 await t.test('profile actor is derived from auth, not payload',async()=>{await command(seeker,'profile.save',{name:'Jordan',userId:owner});const p=await rows(seeker,'select * from seeker_profiles');assert.equal(p.length,1);assert.equal(p[0].user_id,seeker);assert.equal(p[0].email,'seeker@example.test');});
 await t.test('anonymous cannot call writes',async()=>{await assert.rejects(()=>command(null,'profile.save',{name:'Bad'}),/permission denied/);});
 await t.test('direct writes denied even for authenticated users',async()=>{await assert.rejects(()=>rows(seeker,"update seeker_profiles set full_name='Tampered'"),/permission denied/);});
 await t.test('foreign resume cannot be submitted',async()=>{await command(other,'profile.save',{name:'Other'});await assert.rejects(()=>command(other,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'}}),/Resume access denied/);assert.equal((await rows(other,'select * from applications')).length,0);});
 await t.test('required answers roll back incomplete submission',async()=>{await assert.rejects(()=>command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{}}),/Answer all/);assert.equal((await rows(seeker,'select * from applications')).length,0);});
 await t.test('draft visible only to its seeker',async()=>{application=(await command(seeker,'application.draft',{jobId:job,resumeId:resume,answers:{}})).id;assert.equal((await rows(owner,'select * from applications')).length,0);assert.equal((await rows(seeker,'select * from application_drafts')).length,1);});
 await t.test('failed must-have answer does not auto-reject',async()=>{await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'No'}});const [a]=await rows(seeker,'select * from applications');assert.equal(a.stage,'new');assert.equal(a.state,'submitted');});
 await t.test('duplicate submission returns original record',async()=>{const a=await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'}});assert.equal(a.id,application);assert.equal(a.existing,true);assert.equal((await rows(seeker,'select * from applications')).length,1);});
 await t.test('profile edits cannot change frozen submission',async()=>{await command(seeker,'profile.save',{name:'Jordan updated'});const [s]=await rows(seeker,'select * from application_snapshots');assert.equal(s.profile.full_name,'Jordan');assert.equal(s.answers[question],'No');});
 await t.test('snapshots reject even accidental privileged UPDATE',async()=>{await db.exec('reset role');await assert.rejects(()=>db.exec("update application_snapshots set profile='{}'"),/immutable/);});
 await t.test('cross-company applicant and resume access denied',async()=>{assert.equal((await rows(other,'select * from applications')).length,0);assert.equal((await rows(other,'select * from resume_versions')).length,0);await assert.rejects(()=>command(other,'application.move',{id:application,stage:'hired'}),/denied/);});
 await t.test('assigned recruiter can move stage; manager cannot',async()=>{await command(recruiter,'application.move',{id:application,stage:'reviewed'});await assert.rejects(()=>command(manager,'application.move',{id:application,stage:'hired'}),/denied/);});
 await t.test('manager notes are never readable by the seeker',async()=>{await command(manager,'application.note',{id:application,body:'Strong clinical experience',rating:4});assert.equal((await rows(seeker,'select * from application_notes')).length,0);assert.equal((await rows(owner,'select * from application_notes')).length,1);});
 await t.test('resume access revokes immediately with membership',async()=>{assert.equal((await rows(recruiter,'select * from resume_versions')).length,1);await command(owner,'member.remove',{companyId:company,userId:recruiter});assert.equal((await rows(recruiter,'select * from resume_versions')).length,0);await assert.rejects(()=>command(recruiter,'application.move',{id:application,stage:'hired'}),/denied/);});
 await t.test('blocked company cannot send messages',async()=>{await command(seeker,'company.block',{companyId:company,blocked:true});await assert.rejects(()=>command(owner,'message.send',{id:application,body:'Hello'}),/blocked/);await command(seeker,'company.block',{companyId:company,blocked:false});await command(owner,'message.send',{id:application,body:'Hello'});assert.equal((await rows(seeker,'select * from application_messages')).length,1);});
 await t.test('withdrawn reapplication stays the same application',async()=>{await command(seeker,'application.withdraw',{id:application});const r=await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'}});assert.equal(r.id,application);assert.equal(r.state,'withdrawn');});
 await t.test('reinstatement requires seeker request and employer approval',async()=>{await assert.rejects(()=>command(owner,'application.reinstate',{id:application}),/confirmation/);await command(seeker,'application.request_reinstatement',{id:application});await assert.rejects(()=>command(seeker,'application.reinstate',{id:application}),/permission/);await command(owner,'application.reinstate',{id:application});assert.equal((await rows(seeker,'select state from applications'))[0].state,'submitted');});
 await t.test('moderation cannot be performed by company owner',async()=>{await assert.rejects(()=>command(owner,'job.review',{id:job,decision:'approve',reason:'Looks good'}),/Admin required/);});
 await t.test('editing a live job removes it from public results for review',async()=>{await command(owner,'job.save',{id:job,companyId:company,title:'Nurse updated',description:'This updated nursing description requires a fresh platform review.',type:'Full-time',arrangement:'hybrid',locations:['Melbourne'],min:80000,max:100000,period:'year'});assert.equal((await rows(null,'select id from jobs where id=$1',[job])).length,0);await assert.rejects(()=>command(other,'application.draft',{jobId:job}),/not accepting/);await command(admin,'job.review',{id:job,decision:'approve',reason:'Verified content'});assert.equal((await rows(null,'select id from jobs where id=$1',[job])).length,1);});
 await t.test('resume upload ownership and immutable version registration',async()=>{await assert.rejects(()=>rows(other,'insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['resumes',`${seeker}/stolen.pdf`,other]),/row-level security/);await rows(seeker,'insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',['resumes',`${seeker}/new.pdf`,seeker]);const [r]=await rows(seeker,"select jp_register_resume($1,'new.pdf','application/pdf') as id",[`${seeker}/new.pdf`]);const versions=await rows(seeker,'select version from resume_versions order by version');assert.deepEqual(versions.map(x=>x.version),[1,2]);await assert.rejects(()=>rows(other,"select jp_register_resume($1,'stolen.pdf','application/pdf')",[`${seeker}/new.pdf`]),/denied/);assert.ok(r.id);});
 await t.test('notification queue is inaccessible to end users and skips revoked recipients',async()=>{
  await assert.rejects(()=>rows(seeker,'select * from private.notification_deliveries'),/permission denied/);
  await assert.rejects(()=>rows(owner,'select * from jp_claim_notification_mail()'),/permission denied/);
  await db.exec('reset role');await db.exec('set role service_role');
  const claimed=(await db.query('select * from jp_claim_notification_mail()')).rows;
  assert.ok(claimed.length>0);assert.equal(claimed.some(d=>d.recipient_id===recruiter),false);
  const d=claimed[0];
  assert.equal((await db.query('select jp_finish_notification_mail($1,$2,true,$3) as ok',[d.id,uid(999),'provider-test'])).rows[0].ok,false);
  assert.equal((await db.query('select jp_finish_notification_mail($1,$2,true,$3) as ok',[d.id,d.lease_token,'provider-test'])).rows[0].ok,true);
  const again=(await db.query('select * from jp_claim_notification_mail()')).rows;assert.equal(again.some(x=>x.id===d.id),false);
 });
 await t.test('outbox and audits committed with state changes',async()=>{await db.exec('reset role');assert.ok((await db.query('select * from private.outbox')).rows.length>5);assert.ok((await rows(admin,'select * from audit_log')).length>=3);assert.equal((await rows(owner,'select * from audit_log')).length,0);});

 await t.test('team invitations require company owner permission',async()=>{await assert.rejects(()=>rows(manager,"select jp_team_command('invite',$1::jsonb)",[JSON.stringify({companyId:company,email:'recruiter@example.test',role:'recruiter',hash:'a'.repeat(64)})]),/Owner required/);});
 await t.test('invitation is email-bound, single-use and clears old assignments',async()=>{
  await rows(owner,"select jp_team_command('invite',$1::jsonb)",[JSON.stringify({companyId:company,email:'recruiter@example.test',role:'recruiter',hash:'a'.repeat(64)})]);
  await assert.rejects(()=>rows(other,"select jp_team_command('accept',$1::jsonb)",[JSON.stringify({hash:'a'.repeat(64)})]),/invited, confirmed/);
  await rows(recruiter,"select jp_team_command('accept',$1::jsonb)",[JSON.stringify({hash:'a'.repeat(64)})]);
  assert.equal((await rows(recruiter,'select * from applications')).length,0);
  await assert.rejects(()=>rows(recruiter,"select jp_team_command('accept',$1::jsonb)",[JSON.stringify({hash:'a'.repeat(64)})]),/invalid or expired/);
 });
 await t.test('assignment immediately grants and removes applicant access',async()=>{
  await rows(owner,"select jp_team_command('assign',$1::jsonb)",[JSON.stringify({jobId:job,userId:recruiter,assigned:true})]);assert.equal((await rows(recruiter,'select * from applications')).length,1);
  await assert.rejects(()=>rows(owner,"select jp_team_command('assign',$1::jsonb)",[JSON.stringify({jobId:job,userId:other,assigned:true})]),/Active company member/);
  await rows(owner,"select jp_team_command('assign',$1::jsonb)",[JSON.stringify({jobId:job,userId:recruiter,assigned:false})]);assert.equal((await rows(recruiter,'select * from applications')).length,0);
 });
 await t.test('applicants retain job details after closure but public users do not',async()=>{await command(owner,'job.state',{id:job,state:'closed'});assert.equal((await rows(seeker,'select id from jobs where id=$1',[job])).length,1);assert.equal((await rows(null,'select id from jobs where id=$1',[job])).length,0);});
 await t.test('application preferences are private and cannot activate dispatch',async()=>{
  await rows(seeker,"insert into application_preferences(user_id,mode) values($1,'manual')",[seeker]);
  assert.equal((await rows(other,'select * from application_preferences')).length,0);
  assert.equal((await rows(owner,'select * from application_preferences')).length,0);
  await assert.rejects(()=>rows(other,"insert into application_preferences(user_id,mode) values($1,'manual')",[seeker]));
  await assert.rejects(()=>rows(seeker,'update application_preferences set sending_enabled=true where user_id=$1',[seeker]));
  await assert.rejects(()=>rows(other,"insert into application_preferences(user_id,mode,resume_version_id,setup_acknowledged) values($1,'automatic',$2,true)",[other,resume]));
  await rows(seeker,"update application_preferences set mode='automatic',resume_version_id=$2,setup_acknowledged=true where user_id=$1",[seeker,resume]);
  assert.equal((await rows(seeker,'select sending_enabled from application_preferences'))[0].sending_enabled,false);
  await rows(seeker,"update application_preferences set mode='manual',criteria='{}',resume_version_id=null,setup_acknowledged=false where user_id=$1",[seeker]);
 });
 await db.close();
});
