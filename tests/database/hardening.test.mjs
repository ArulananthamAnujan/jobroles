import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {owner,seeker,other,recruiter,job,resume,question}=ids;
test('security hardening',async t=>{
 const {db,rows,command,admin}=await createDb();
 await t.test('expected screening answers are hidden from the public and seekers',async()=>{
  await assert.rejects(()=>rows(null,'select expected_answer from screening_questions'),/permission denied/);
  await assert.rejects(()=>rows(seeker,'select must_have from screening_questions'),/permission denied/);
  assert.equal((await rows(null,'select question from screening_questions where job_id=$1',[job]))[0].question,'Clinical experience?');
  assert.equal((await rows(seeker,'select * from jp_screening_rules($1)',[job])).length,0);
  assert.equal((await rows(other,'select * from jp_screening_rules($1)',[job])).length,0);
  const team=await rows(recruiter,'select * from jp_screening_rules($1)',[job]);
  assert.deepEqual(team.map(r=>[r.id,r.must_have,r.expected_answer]),[[question,true,'Yes']]);
 });
 await t.test('scan results are recorded only by the service role and only once',async()=>{
  await admin("update resume_versions set scan_status='pending' where id=$1",[resume]);
  await assert.rejects(()=>rows(seeker,"select jp_record_resume_scan($1,'clean')",[resume]),/permission denied/);
  assert.equal((await rows('service',"select jp_record_resume_scan($1,'infected') as ok",[resume]))[0].ok,true);
  assert.equal((await rows('service',"select jp_record_resume_scan($1,'clean') as ok",[resume]))[0].ok,false);
 });
 await t.test('infected resumes and withdrawn applications are closed to the hiring team',async()=>{
  await admin("update resume_versions set scan_status='clean' where id=$1",[resume]);
  const sub=await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
  assert.equal(sub.state,'submitted');
  assert.equal((await rows(recruiter,'select id from resume_versions where id=$1',[resume])).length,1);
  await admin("update resume_versions set scan_status='infected' where id=$1",[resume]);
  assert.equal((await rows(recruiter,'select id from resume_versions where id=$1',[resume])).length,0);
  await admin("update resume_versions set scan_status='clean' where id=$1",[resume]);
  await command(seeker,'application.withdraw',{id:sub.id});
  assert.equal((await rows(recruiter,'select id from resume_versions where id=$1',[resume])).length,0);
  assert.equal((await rows(owner,'select id from resume_versions where id=$1',[resume])).length,0);
  assert.equal((await rows(seeker,'select id from resume_versions where id=$1',[resume])).length,1);
 });
 await db.close();
});
