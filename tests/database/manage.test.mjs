// People can remove and manage the things they added (migration 20261112000001_manage_your_things).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids,uid} from './harness.mjs';
const {owner,recruiter,manager,seeker,other,company,job,resume,question,foreignCompany}=ids;
const json=v=>JSON.stringify(v);
test('managing your own things',async t=>{
 const {rows,admin,command}=await createDb();
 await t.test('a resume in use by an application in progress cannot be deleted; otherwise it can, by its owner only',async()=>{
  const spare=uid(700);
  await admin("insert into resume_versions(id,user_id,version,storage_key,filename,mime_type) values($1,$2,2,'test/spare.pdf','spare.pdf','application/pdf')",[spare,seeker]);
  await assert.rejects(()=>rows(other,'select jp_delete_resume($1)',[spare]),/Resume not found/);
  assert.deepEqual((await rows(seeker,'select jp_delete_resume($1) as r',[spare]))[0].r,{storageKey:'test/spare.pdf'});
  assert.equal((await rows(seeker,'select id from resume_versions where deleted_at is null')).length,1);
  await assert.rejects(()=>rows(seeker,'select jp_delete_resume($1)',[spare]),/Resume not found/);
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
  await assert.rejects(()=>rows(seeker,'select jp_delete_resume($1)',[resume]),/sent with an application that is still in progress/);
  const app=(await admin('select id from applications where job_id=$1 and seeker_id=$2',[job,seeker]))[0].id;
  await command(seeker,'application.withdraw',{id:app});
  await rows(seeker,'select jp_delete_resume($1)',[resume]);
  assert.equal((await rows(seeker,'select id from resume_versions where deleted_at is null')).length,0);
 });
 await t.test('the stored file can be removed only by its owner, and only once the resume is deleted',async()=>{
  await admin('grant select,delete on storage.objects to authenticated');
  await admin("insert into storage.objects(bucket_id,name,owner_id) values('resumes',$1,$2),('resumes',$3,$2)",[`${seeker}/gone.pdf`,seeker,`${seeker}/kept.pdf`]);
  await admin("insert into resume_versions(user_id,version,storage_key,filename,mime_type) values($1,5,$2,'kept.pdf','application/pdf')",[seeker,`${seeker}/kept.pdf`]);
  await rows(other,"delete from storage.objects where bucket_id='resumes'");
  await rows(seeker,"delete from storage.objects where bucket_id='resumes'");
  assert.deepEqual((await admin("select name from storage.objects where bucket_id='resumes' order by name")).map(r=>r.name),[`${seeker}/kept.pdf`]);
 });
 await t.test('a draft application can be discarded by the applicant',async()=>{
  await admin("insert into jobs(id,company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,published_at,expires_at) values($1,$2,'Ward Clerk','A meaningful clerical role with a supportive clinical team in Frankston.','live','Full-time','on_site',60000,70000,'year',now(),now()+interval '30 days')",[uid(710),company]);
  await command(seeker,'application.draft',{jobId:uid(710),answers:{},cover:'Half written'});
  const draft=(await admin("select id from applications where job_id=$1 and state='draft'",[uid(710)]))[0].id;
  await assert.rejects(()=>rows(other,'select jp_discard_draft($1)',[draft]),/Draft not found/);
  await rows(seeker,'select jp_discard_draft($1)',[draft]);
  assert.equal((await admin('select count(*)::int n from applications where id=$1',[draft]))[0].n,0);
 });
 await t.test('people see and delete their own reviews, salaries and questions, and nobody else’s',async()=>{
  await admin("insert into company_reviews(id,company_id,author_id,rating,title,pros,cons,kind,status) values($1,$2,$3,4,'Good place','Supportive supervisors here','Late shifts sometimes','workplace','published')",[uid(720),company,seeker]);
  await admin("insert into salary_reports(id,company_id,author_id,job_title,pay,period) values($1,$2,$3,'Registered Nurse',95000,'year')",[uid(721),company,seeker]);
  await admin("insert into company_questions(id,company_id,author_id,body,status) values($1,$2,$3,'What are the usual rostered hours for nurses here?','pending')",[uid(722),company,seeker]);
  const mine=(await rows(seeker,'select jp_my_contributions() as r'))[0].r;
  assert.deepEqual([mine.reviews.length,mine.salaries.length,mine.questions.length,mine.reviews[0].company],[1,1,1,'Bayside']);
  assert.deepEqual((await rows(other,'select jp_my_contributions() as r'))[0].r,{reviews:[],salaries:[],interviews:[],questions:[],answers:[]});
  await assert.rejects(()=>rows(other,"select jp_delete_contribution('review',$1)",[uid(720)]),/Not found/);
  await assert.rejects(()=>rows(null,"select jp_delete_contribution('review',$1)",[uid(720)]),/permission denied/);
  for(const [kind,id] of [['review',uid(720)],['salary',uid(721)],['question',uid(722)]])await rows(seeker,'select jp_delete_contribution($1,$2)',[kind,id]);
  assert.deepEqual((await rows(seeker,'select jp_my_contributions() as r'))[0].r,{reviews:[],salaries:[],interviews:[],questions:[],answers:[]});
 });
 await t.test('team notes are deleted by their author only',async()=>{
  await command(seeker,'application.submit',{jobId:uid(710),resumeId:(await admin("insert into resume_versions(user_id,version,storage_key,filename,mime_type) values($1,9,'test/n.pdf','n.pdf','application/pdf') returning id",[seeker]))[0].id,answers:{},cover:''});
  const app=(await admin('select id from applications where job_id=$1',[uid(710)]))[0].id;
  await command(owner,'application.note',{id:app,body:'Strong background'});
  const note=(await admin('select id from application_notes where application_id=$1',[app]))[0].id;
  await assert.rejects(()=>rows(recruiter,'select jp_delete_note($1)',[note]),/only notes you wrote/);
  await rows(owner,'select jp_delete_note($1)',[note]);
  assert.equal((await admin('select count(*)::int n from application_notes where id=$1',[note]))[0].n,0);
 });
 await t.test('only a never-published draft job can be deleted, by someone who may edit it',async()=>{
  const made=await command(owner,'job.save',{companyId:company,title:'Night Nurse',description:'Care for patients overnight on a busy medical ward in Frankston.',type:'Full-time',arrangement:'on_site',locations:['Frankston VIC'],min:90000,max:100000,period:'year',submit:false});
  await assert.rejects(()=>rows(other,'select jp_delete_draft_job($1)',[made.id]),/Only your own drafts/);
  await assert.rejects(()=>rows(owner,'select jp_delete_draft_job($1)',[job]),/Only your own drafts/);
  await rows(owner,'select jp_delete_draft_job($1)',[made.id]);
  assert.equal((await admin('select count(*)::int n from jobs where id=$1',[made.id]))[0].n,0);
 });
 await t.test('an owner changes a colleague’s role; nobody changes an owner or another company',async()=>{
  await assert.rejects(()=>rows(recruiter,'select jp_change_role($1,$2,$3)',[company,manager,'recruiter']),/owner required/);
  await assert.rejects(()=>rows(owner,'select jp_change_role($1,$2,$3)',[company,owner,'recruiter']),/Team member not found/);
  await assert.rejects(()=>rows(owner,'select jp_change_role($1,$2,$3)',[company,manager,'owner']),/recruiter or hiring manager/);
  await assert.rejects(()=>rows(owner,'select jp_change_role($1,$2,$3)',[foreignCompany,other,'recruiter']),/owner required/);
  await rows(owner,'select jp_change_role($1,$2,$3)',[company,manager,'recruiter']);
  assert.equal((await admin('select role::text from company_memberships where company_id=$1 and user_id=$2',[company,manager]))[0].role,'recruiter');
 });
});
