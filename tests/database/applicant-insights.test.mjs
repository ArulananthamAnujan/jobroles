// Searching inside resumes and ranking applicants by keyword match (migration 20261126000001_applicant_search_and_match).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids,uid} from './harness.mjs';
const {owner,seeker,other,job,resume,question,foreignJob}=ids;
test('applicant search and match',async t=>{
 const {rows,admin,command}=await createDb();
 await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
 const app=(await admin('select id from applications where job_id=$1 and seeker_id=$2',[job,seeker]))[0].id;
 const insights=async(who,q=null)=>(await rows(who,'select jp_applicant_insights($1,$2) as r',[job,q]))[0].r;
 await t.test('before a resume has been read it is reported as waiting, and scored on the profile alone',async()=>{
  assert.deepEqual((await rows(owner,'select resume_version_id from jp_unindexed_resumes($1)',[job])).map(r=>r.resume_version_id),[resume]);
  const r=await insights(owner);assert.equal(Number(r.waiting),1);assert.equal(r.applicants[app].read,false);
  assert.ok(r.terms.includes('nurse')&&r.terms.includes('registered'),'the job title gives the key words: '+r.terms.join(', '));
  assert.ok(!r.terms.includes('team')&&!r.terms.includes('role'),'filler words are left out');
 });
 await t.test('only someone allowed to read the resume can store its text, and only the owner can replace it',async()=>{
  await assert.rejects(()=>rows(other,'select jp_index_resume($1,$2)',[resume,'fake']),/Resume not found/);
  await rows(owner,'select jp_index_resume($1,$2)',[resume,'Registered Nurse with five years on acute clinical wards in Frankston. AHPRA registration. Mentors graduate nurses.']);
  await rows(owner,'select jp_index_resume($1,$2)',[resume,'replaced by the employer']);
  assert.match((await admin('select body from private.resume_text where resume_version_id=$1',[resume]))[0].body,/^Registered Nurse with five years/);
  await rows(seeker,'select jp_index_resume($1,$2)',[resume,'Registered Nurse with five years on acute clinical wards in Frankston. AHPRA registration. Mentors graduate nurses. Forklift licence.']);
  assert.match((await admin('select body from private.resume_text where resume_version_id=$1',[resume]))[0].body,/Forklift licence\.$/);
  assert.equal((await rows(owner,'select resume_version_id from jp_unindexed_resumes($1)',[job])).length,0);
 });
 await t.test('the match score is the share of the job’s key words found, with the matched words listed',async()=>{
  const r=await insights(owner),a=r.applicants[app];
  assert.equal(Number(r.waiting),0);assert.equal(a.read,true);
  assert.ok(a.score>=50&&a.score<=100,'score '+a.score);
  for(const w of ['nurse','registered','clinical','frankston'])assert.ok(a.matched.includes(w),`matched ${w}: ${a.matched.join(', ')}`);
  assert.equal(a.hit,undefined,'no search, so no hit flag');
 });
 await t.test('searching looks inside the resume and returns where the words were found',async()=>{
  let a=(await insights(owner,'AHPRA')).applicants[app];assert.equal(a.hit,true);assert.match(a.snippet,/\[\[AHPRA\]\] registration/);
  a=(await insights(owner,'forklift licence')).applicants[app];assert.equal(a.hit,true);
  a=(await insights(owner,'mentoring')).applicants[app];assert.equal(a.hit,true,'word forms match: mentoring finds Mentors');
  a=(await insights(owner,'python')).applicants[app];assert.equal(a.hit,false);assert.equal(a.snippet,undefined);
  a=(await insights(owner,'"acute clinical wards"')).applicants[app];assert.equal(a.hit,true);
  a=(await insights(owner,"it's (a] :* & weird | query")).applicants[app];assert.equal(typeof a.hit,'boolean','odd punctuation does not break the search');
 });
 await t.test('other companies and job seekers cannot use it',async()=>{
  await assert.rejects(()=>rows(other,'select jp_applicant_insights($1,null)',[job]),/Job access denied/);
  await assert.rejects(()=>rows(seeker,'select jp_applicant_insights($1,null)',[job]),/Job access denied/);
  await assert.rejects(()=>rows(owner,'select jp_applicant_insights($1,null)',[foreignJob]),/Job access denied/);
  await assert.rejects(()=>rows(null,'select jp_applicant_insights($1,null)',[job]),/permission denied/);
  await assert.rejects(()=>rows(other,'select * from jp_unindexed_resumes($1)',[job]),/Job access denied/);
 });
 await t.test('a withdrawn application is left out',async()=>{
  await command(seeker,'application.withdraw',{id:app});
  assert.deepEqual((await insights(owner)).applicants,{});
 });
});
