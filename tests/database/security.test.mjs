// Regression tests for the November 2026 security review (migration 20261110000002_security_fixes).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids,uid} from './harness.mjs';
const {owner,recruiter,seeker,other,admin:adminId,company,job,foreignCompany}=ids;
const json=v=>JSON.stringify(v);
test('security review fixes',async t=>{
 const {rows,admin,command}=await createDb();
 await t.test('resume autofill has a durable daily allowance per account',async()=>{
  await assert.rejects(()=>rows(null,'select jp_resume_ai_quota()'),/permission denied/);
  for(let i=0;i<5;i++)assert.equal((await rows(seeker,'select jp_resume_ai_quota() as ok'))[0].ok,true);
  assert.equal((await rows(seeker,'select jp_resume_ai_quota() as ok'))[0].ok,false);
  assert.equal((await rows(other,'select jp_resume_ai_quota() as ok'))[0].ok,true);
  await admin("update private.resume_ai_usage set usage_day=usage_day-1 where user_id=$1",[seeker]);
  assert.equal((await rows(seeker,'select jp_resume_ai_quota() as ok'))[0].ok,true);
 });
 await t.test('a push subscription cannot be taken over by someone who only knows its address',async()=>{
  const p='B'.repeat(87),a='c'.repeat(22),endpoint='https://push.example/device-1';
  await rows(seeker,'select jp_save_push($1,$2,$3)',[endpoint,p,a]);
  await assert.rejects(()=>rows(other,'select jp_save_push($1,$2,$3)',[endpoint,'D'.repeat(87),'e'.repeat(22)]),/another account/);
  assert.equal((await admin('select user_id from push_subscriptions where endpoint=$1',[endpoint]))[0].user_id,seeker);
  // The same browser, with the same keys, signing in as someone else is allowed; so is refreshing your own.
  await rows(seeker,'select jp_save_push($1,$2,$3)',[endpoint,p,a]);
  await rows(other,'select jp_save_push($1,$2,$3)',[endpoint,p,a]);
  assert.equal((await admin('select user_id from push_subscriptions where endpoint=$1',[endpoint]))[0].user_id,other);
 });
 await t.test('a removed team member no longer answers as the employer',async()=>{
  const q=uid(900);
  await admin("insert into company_questions(id,company_id,author_id,body,status,published_at) values($1,$2,$3,'What are the usual rostered hours for nurses here?','published',now())",[q,company,seeker]);
  await command(owner,'member.remove',{companyId:company,userId:recruiter});
  assert.deepEqual((await rows(recruiter,"select jp_answer_question($1,'Rosters are published two weeks ahead.') as r",[q]))[0].r,{status:'pending'});
  assert.deepEqual((await rows(owner,"select jp_answer_question($1,'Rosters are published two weeks ahead.') as r",[q]))[0].r,{status:'published'});
 });
 await t.test('company images must be files in the company’s own folder on the storage host',async()=>{
  const ok=`https://abc123.supabase.co/storage/v1/object/public/company-media/${company}/logo.png`;
  for(const bad of [`https://evil.example/t.gif?x=/storage/v1/object/public/company-media/${company}/`,`https://evil.example/storage/v1/object/public/company-media/${company}/logo.png`,`${ok}?x=1`,`https://abc123.supabase.co/storage/v1/object/public/company-media/${company}/../${foreignCompany}/a.png`,ok.replace(company,foreignCompany)])
   await assert.rejects(()=>rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,json({logoUrl:bad})]),/uploaded through JobRoles/,bad);
  await rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,json({logoUrl:ok})]);
  // A project on its own domain names that host once.
  const custom=`https://files.jobroles.example/storage/v1/object/public/company-media/${company}/cover.webp`;
  await assert.rejects(()=>rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,json({coverUrl:custom})]),/uploaded through JobRoles/);
  await admin(`insert into private.settings(key,value) values('media_host','"files.jobroles.example"')`);
  await rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,json({coverUrl:custom})]);
 });
 await t.test('new public wording on a live job goes back to review',async()=>{
  const state=async()=>(await admin('select state::text from jobs where id=$1',[job]))[0].state;
  const same=(await admin('select question,must_have,expected_answer from screening_questions where job_id=$1 order by position',[job])).map(q=>({question:q.question,mustHave:!q.must_have,expected:q.expected_answer}));
  await rows(owner,'select jp_set_screening($1,$2::jsonb)',[job,json(same)]);
  assert.equal(await state(),'live','changing only the hidden rule keeps the job live');
  await rows(owner,'select jp_job_extras($1,$2::jsonb)',[job,json({benefits:[]})]);
  assert.equal(await state(),'live','unchanged benefits keep the job live');
  await rows(owner,'select jp_set_screening($1,$2::jsonb)',[job,json([{question:'Message me on WhatsApp to apply?',mustHave:false,expected:'Yes'}])]);
  assert.equal(await state(),'pending_review');
  await admin("update jobs set state='live' where id=$1",[job]);
  await rows(owner,'select jp_job_extras($1,$2::jsonb)',[job,json({benefits:['Pay a joining fee by gift card']})]);
  assert.equal(await state(),'pending_review');
  assert.equal((await rows(null,'select id from jobs where id=$1',[job])).length,0);
 });
 await t.test('a stranger cannot use up a signed-in person’s support requests',async()=>{
  const body='I cannot find where to change my email address.';
  for(let i=0;i<5;i++)await rows(null,"select jp_submit_ticket('seeker@example.test','Stranger','account',$1)",[body]);
  await assert.rejects(()=>rows(null,"select jp_submit_ticket('seeker@example.test','Stranger','account',$1)",[body]),/several requests/);
  await rows(seeker,"select jp_submit_ticket('seeker@example.test','Sam','account',$1)",[body]);
 });
 await t.test('salary search leaves out suspended employers',async()=>{
  await admin("update jobs set state='live' where id=$1",[job]);
  const names=async()=>((await rows(null,"select jp_salary_lookup('registered nurse') as r"))[0].r.topPaying||[]).map(c=>c.name).sort();
  assert.deepEqual(await names(),['Bayside','Other company']);
  await admin('update companies set suspended_at=now() where id=$1',[foreignCompany]);
  assert.deepEqual(await names(),['Bayside']);
 });
 await t.test('registering an unverified company does not block listing that employer’s careers feed',async()=>{
  await command(seeker,'company.create',{name:'Harbour Health',about:'',agency:false});
  const made=(await rows(adminId,"select jp_source_command('create',$1::jsonb) as r",[json({name:'Harbour Health',url:'https://boards-api.greenhouse.io/v1/boards/harbour/jobs',format:'greenhouse'})]))[0].r;
  assert.ok(made.companyId);
  await assert.rejects(()=>rows(adminId,"select jp_source_command('create',$1::jsonb)",[json({name:'Bayside',url:'https://boards-api.greenhouse.io/v1/boards/bayside/jobs',format:'greenhouse'})]),/already has an account/);
 });
});
test('security review follow-up',async t=>{
 const {rows,admin,command}=await createDb();
 const {manager,resume,question}=ids;
 await t.test('after a withdrawal the hiring team keeps only the name, headline and location',async()=>{
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:'I would love this role.'});
  const app=(await admin('select id from applications where job_id=$1 and seeker_id=$2',[job,seeker]))[0].id;
  assert.equal((await rows(owner,'select application_id from application_snapshots where application_id=$1',[app])).length,1);
  const before=(await rows(owner,'select * from jp_pipeline($1)',[job]))[0];
  assert.equal(before.email,'seeker@example.test');assert.equal(before.resume_version_id,resume);
  await command(seeker,'application.withdraw',{id:app});
  assert.equal((await rows(owner,'select application_id from application_snapshots where application_id=$1',[app])).length,0);
  assert.equal((await rows(seeker,'select application_id from application_snapshots where application_id=$1',[app])).length,1);
  const after=(await rows(owner,'select * from jp_pipeline($1)',[job]))[0];
  assert.deepEqual([after.full_name,after.state,after.email,after.answers,after.resume_version_id],['Sam Seeker','withdrawn',null,{},null]);
  assert.equal((await rows(owner,'select jp_candidate_extras($1) as r',[app]))[0].r,null);
 });
 await t.test('hiring managers see colleagues’ emails shortened and no event attendee details',async()=>{
  const emails=async who=>(await rows(who,'select jp_team($1) as r',[company]))[0].r.members.map(m=>m.email).sort();
  assert.deepEqual(await emails(owner),['manager@example.test','owner@example.test','recruiter@example.test']);
  assert.deepEqual(await emails(recruiter),['manager@example.test','owner@example.test','recruiter@example.test']);
  assert.deepEqual(await emails(manager),['manager@example.test','o…@example.test','r…@example.test']);
  const ev=uid(950);
  await admin("insert into hiring_events(id,company_id,title,description,starts_at,ends_at,time_zone,mode,created_by) values($1,$2,'Open day','Meet the team and tour the ward on the day.',now()+interval '5 days',now()+interval '5 days 2 hours','Australia/Melbourne','online',$3)",[ev,company,owner]);
  await admin('insert into event_registrations(event_id,user_id) values($1,$2)',[ev,seeker]);
  const attendees=async who=>(await rows(who,'select jp_company_events($1) as r',[company]))[0].r[0].attendees;
  assert.equal((await attendees(owner)).length,1);assert.equal((await attendees(recruiter)).length,1);
  assert.deepEqual(await attendees(manager),[]);
 });
 await t.test('a company handed over from job sourcing waits for its ABN check before recruiting tools open',async()=>{
  const made=(await rows(adminId,"select jp_source_command('create',$1::jsonb) as r",[json({name:'Harbour Health',url:'https://boards-api.greenhouse.io/v1/boards/harbour/jobs',format:'greenhouse'})]))[0].r;
  await rows(adminId,"select jp_source_command('claim',$1::jsonb)",[json({companyId:made.companyId,email:'other@example.test'})]);
  await assert.rejects(()=>rows(other,'select * from jp_search_candidates($1)',[made.companyId]));
  await assert.rejects(()=>rows(other,'select jp_can_buy_credit($1)',[made.companyId]));
  await rows(adminId,"select jp_source_command('verify',$1::jsonb)",[json({companyId:made.companyId,abn:'51824753556',reason:'ABR lookup matched'})]);
  await rows(other,'select * from jp_search_candidates($1)',[made.companyId]);
  await rows(other,'select jp_can_buy_credit($1)',[made.companyId]);
 });
 await t.test('counted views of one job are capped each hour',async()=>{
  for(let i=0;i<310;i++)await rows(null,'select jp_record_job_view($1)',[job]);
  assert.equal((await admin('select views from job_view_counts where job_id=$1',[job]))[0].views,300);
  await admin("update job_view_counts set hour_start=hour_start-interval '1 hour' where job_id=$1",[job]);
  await rows(null,'select jp_record_job_view($1)',[job]);
  assert.equal((await admin('select views from job_view_counts where job_id=$1',[job]))[0].views,301);
 });
});
test('resume files can be read directly only by people the resume rules already allow',async t=>{
 const {rows,admin,command}=await createDb();
 const {manager,resume,question}=ids;
 // Supabase itself lets signed-in people query storage.objects, subject to its policies; the test stand-in needs telling.
 await admin('grant select on storage.objects to authenticated');
 await admin("insert into storage.objects(bucket_id,name,owner_id) values('resumes','test/resume.pdf',$1),('resumes','other/private.pdf',$2),('company-media','x/logo.png',$2)",[seeker,other]);
 const can=async who=>(await rows(who,"select name from storage.objects where bucket_id='resumes' order by name")).map(r=>r.name);
 await t.test('before applying: only the owner',async()=>{
  assert.deepEqual(await can(seeker),['test/resume.pdf']);
  for(const who of [owner,recruiter,manager,other,adminId])assert.deepEqual(await can(who),[],who);
  await assert.rejects(()=>rows(null,'select name from storage.objects'),/permission denied/);
 });
 let app;
 await t.test('after applying: the job’s team, and nobody at another company',async()=>{
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
  app=(await admin('select id from applications where job_id=$1 and seeker_id=$2',[job,seeker]))[0].id;
  assert.deepEqual(await can(owner),['test/resume.pdf']);assert.deepEqual(await can(recruiter),['test/resume.pdf']);
  assert.deepEqual(await can(other),[]);
 });
 await t.test('scan rules: infected files are closed to everyone; pending files wait when scanning is required',async()=>{
  await admin("update resume_versions set scan_status='pending' where id=$1",[resume]);
  assert.deepEqual(await can(owner),['test/resume.pdf']);
  await admin(`insert into private.settings(key,value) values('resume_scan_required','true')`);
  assert.deepEqual(await can(owner),[]);assert.deepEqual(await can(seeker),['test/resume.pdf']);
  await admin("update resume_versions set scan_status='clean' where id=$1",[resume]);
  assert.deepEqual(await can(owner),['test/resume.pdf']);
  await admin("update resume_versions set scan_status='infected' where id=$1",[resume]);
  assert.deepEqual(await can(owner),[]);assert.deepEqual(await can(seeker),[]);
  await admin("update resume_versions set scan_status='clean' where id=$1",[resume]);
 });
 await t.test('withdrawing ends the team’s access',async()=>{
  await command(seeker,'application.withdraw',{id:app});
  assert.deepEqual(await can(owner),[]);assert.deepEqual(await can(seeker),['test/resume.pdf']);
 });
});
