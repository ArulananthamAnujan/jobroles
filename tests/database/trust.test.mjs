import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {owner,recruiter,manager,seeker,other,admin:adminId,company,job,foreignJob,foreignCompany}=ids;
test('sponsorship, candidate search and trust signals',async t=>{
 const {db,rows,command,admin}=await createDb();
 await t.test('only the team can start a sponsorship, and only for live roles',async()=>{
  assert.equal((await rows(recruiter,'select jp_can_sponsor($1) as r',[job]))[0].r.companyId,company);
  for(const u of [manager,seeker,other])await assert.rejects(()=>rows(u,'select jp_can_sponsor($1)',[job]),/Employer access required/);
  await assert.rejects(()=>rows(owner,'select jp_record_sponsorship($1,$2,$3,1,$4,30)',['cs_1',job,owner,'aud']),/permission denied/);
 });
 await t.test('a paid session records once, extends later purchases and lifts best-match results',async()=>{
  const first=(await rows('service','select jp_record_sponsorship($1,$2,$3,9900,$4,30) as r',['cs_1',job,owner,'AUD']))[0].r;
  assert.equal((await rows('service','select jp_record_sponsorship($1,$2,$3,9900,$4,30) as r',['cs_1',job,owner,'AUD']))[0].r.duplicate,true);
  await rows('service','select jp_record_sponsorship($1,$2,$3,9900,$4,30)',['cs_2',job,owner,'AUD']);
  const spans=await admin('select starts_at,ends_at from job_sponsorships order by starts_at');
  assert.equal(spans.length,2);assert.equal(spans[1].starts_at.getTime(),spans[0].ends_at.getTime());assert.ok(first.id);
  const r=await rows(null,"select job_id,sponsored from jp_search_jobs(p_query=>'nurse')");
  assert.deepEqual(r.map(x=>[x.job_id,x.sponsored]),[[job,true],[foreignJob,false]]);
  await assert.rejects(()=>rows(null,'select * from job_sponsorships'),/permission denied/);
  assert.equal((await rows(other,'select id from job_sponsorships')).length,0);
  assert.equal((await rows(owner,'select amount_total from job_sponsorships')).length,2);
 });
 await t.test('candidate search shows only opted-in profiles, to verified employer teams',async()=>{
  await command(seeker,'profile.save',{name:'Sam Seeker',headline:'Registered nurse',location:'Frankston VIC',skills:['triage'],searchable:false});
  assert.equal((await rows(owner,'select * from jp_search_candidates($1,$2)',[company,'nurse'])).length,0);
  await command(seeker,'profile.save',{name:'Sam Seeker',headline:'Registered nurse',location:'Frankston VIC',skills:['triage'],searchable:true});
  const [c]=await rows(recruiter,'select * from jp_search_candidates($1,$2,$3,$4)',[company,'nurse','Melbourne',60]);
  assert.equal(c.full_name,'Sam Seeker');assert.ok(c.distance_km>30&&c.distance_km<60);assert.equal(Object.hasOwn(c,'email'),false);
  await assert.rejects(()=>rows(manager,'select * from jp_search_candidates($1)',[company]),/Verified employer/);
  await admin('update companies set verified_at=null where id=$1',[foreignCompany]);
  await assert.rejects(()=>rows(other,'select * from jp_search_candidates($1)',[foreignCompany]),/Verified employer/);
 });
 await t.test('invitations reach the seeker once and respect blocks',async()=>{
  const note='We think your triage experience suits our emergency team.';
  await rows(owner,'select jp_invite_candidate($1,$2,$3)',[job,seeker,note]);
  await assert.rejects(()=>rows(owner,'select jp_invite_candidate($1,$2,$3)',[job,seeker,note]),/already invited/);
  assert.equal((await rows(seeker,'select message from candidate_invites'))[0].message,note);
  assert.equal((await rows(manager,'select * from candidate_invites')).length,0);
  await admin('insert into company_blocks(seeker_id,company_id) values($1,$2)',[seeker,company]);
  assert.equal((await rows(owner,'select * from jp_search_candidates($1,$2)',[company,'nurse'])).length,0);
 });
 await t.test('risky listings are flagged for administrators only',async()=>{
  await admin(`update jobs set description='Earn $500 per day from home. Pay the training fee to start. Message us on Telegram or email jobs.now@gmail.com',salary_min=15,salary_max=400,salary_period='hour',employment_type='Casual' where id=$1`,[foreignJob]);
  const [r]=await rows(adminId,'select * from jp_job_risk($1)',[[foreignJob,job]]);
  assert.deepEqual(r.flags,['Asks applicants to pay','Moves contact to a messaging app','Personal email address in the listing','Too-good-to-be-true pay claims','Unusually high pay','Pay may be below the national minimum wage','Very wide pay range']);
  await assert.rejects(()=>rows(owner,'select * from jp_job_risk($1)',[[foreignJob]]),/Administrator required/);
 });
 await t.test('responsiveness needs at least five applications',async()=>{assert.equal((await rows(null,'select jp_company_responsiveness($1) as r',[company]))[0].r,null);});
 await db.close();
});
