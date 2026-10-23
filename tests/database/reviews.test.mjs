import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,other,owner,recruiter,admin:adminId,company,job,resume,question}=ids;
const review=['Clear and quick process','They replied within a week and explained each step.','The interview time changed twice at short notice.'];
test('company reviews',async t=>{
 const {db,rows,command}=await createDb();
 await t.test('only real applicants can review, and team members cannot',async()=>{
  await assert.rejects(()=>rows(seeker,'select jp_submit_review($1,4,$2,$3,$4)',[company,...review]),/Only people who applied/);
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
  await assert.rejects(()=>rows(seeker,'select jp_submit_review($1,9,$2,$3,$4)',[company,...review]),/1 to 5 stars/);
  await rows(seeker,'select jp_submit_review($1,4,$2,$3,$4)',[company,...review]);
  await assert.rejects(()=>rows(recruiter,'select jp_submit_review($1,5,$2,$3,$4)',[company,...review]),/Only people who applied|team members/);
 });
 await t.test('pending reviews are hidden from the public and the employer',async()=>{
  assert.equal((await rows(null,'select id from company_reviews')).length,0);
  assert.equal((await rows(owner,'select id from company_reviews')).length,0);
  assert.equal((await rows(seeker,'select status from company_reviews'))[0].status,'pending');
  await assert.rejects(()=>rows(null,'select author_id from company_reviews'),/permission denied/);
  await assert.rejects(()=>rows(owner,'select * from jp_pending_reviews()'),/Administrator required/);
 });
 await t.test('moderation publishes, the owner replies, and the rating updates',async()=>{
  const [p]=await rows(adminId,'select * from jp_pending_reviews()');assert.equal(p.company_name,'Bayside');assert.equal(Object.hasOwn(p,'author_id'),false);
  await assert.rejects(()=>rows(owner,"select jp_moderate_review($1,'publish','ok')",[p.id]),/Administrator/);
  await rows(adminId,"select jp_moderate_review($1,'publish','Meets guidelines')",[p.id]);
  assert.equal((await rows(null,'select title from company_reviews'))[0].title,review[0]);
  await assert.rejects(()=>rows(recruiter,'select jp_respond_review($1,$2)',[p.id,'Thanks for the feedback on scheduling.']),/owner required/);
  await rows(owner,'select jp_respond_review($1,$2)',[p.id,'Thanks for the feedback on scheduling.']);
  assert.deepEqual((await rows(null,'select jp_company_rating($1) as r',[company]))[0].r,{average:4,count:1});
  assert.equal((await rows(other,'select employer_response from company_reviews'))[0].employer_response,'Thanks for the feedback on scheduling.');
 });
 await db.close();
});
