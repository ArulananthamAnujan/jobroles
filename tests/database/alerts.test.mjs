import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,other}=ids;
test('job alerts',async t=>{
 const {db,rows,admin}=await createDb();
 const saved=(await rows(seeker,"select jp_launch_command('search.save',$1::jsonb) as r",[JSON.stringify({filters:{q:'nurse'}})]))[0].r.id;
 await t.test('only the owner can turn alerts on, with a valid frequency',async()=>{
  await assert.rejects(()=>rows(other,"select jp_set_alert($1,'daily')",[saved]),/not found/);
  await assert.rejects(()=>rows(null,"select jp_set_alert($1,'daily')",[saved]),/permission denied/);
  await assert.rejects(()=>rows(seeker,"select jp_set_alert($1,'hourly')",[saved]),/daily, instant or off/);
  await rows(seeker,"select jp_set_alert($1,'daily')",[saved]);
  const r=await rows(seeker,'select frequency,last_alerted_at from saved_searches');assert.equal(r[0].frequency,'daily');assert.ok(r[0].last_alerted_at);
 });
 await t.test('end users cannot claim alerts or read tokens',async()=>{
  await assert.rejects(()=>rows(seeker,'select * from jp_claim_job_alerts()'),/permission denied/);
  await assert.rejects(()=>rows(seeker,'select * from private.alert_tokens'),/permission denied/);
 });
 await t.test('a daily alert is due only after 23 hours and is leased once',async()=>{
  assert.equal((await rows('service','select * from jp_claim_job_alerts()')).length,0);
  await admin("update saved_searches set last_alerted_at=now()-interval '24 hours'");
  const [claim]=await rows('service','select * from jp_claim_job_alerts()');
  assert.equal(claim.id,saved);assert.equal(claim.email,'seeker@example.test');assert.equal(claim.token.length,64);
  assert.equal((await rows('service','select * from jp_claim_job_alerts()')).length,0);
  assert.equal((await rows('service','select jp_finish_job_alert($1,gen_random_uuid(),now()) as ok',[saved]))[0].ok,false);
  assert.equal((await rows('service','select jp_finish_job_alert($1,$2,$3) as ok',[saved,claim.lease,claim.checked_at]))[0].ok,true);
  assert.equal((await rows('service','select * from jp_claim_job_alerts()')).length,0);
 });
 await t.test('the emailed token unsubscribes without signing in; a wrong token does nothing',async()=>{
  const token=(await admin('select token from private.alert_tokens'))[0].token;
  assert.equal((await rows(null,'select jp_unsubscribe_alert($1,$2) as ok',[saved,'0'.repeat(64)]))[0].ok,false);
  assert.equal((await rows(null,'select jp_unsubscribe_alert($1,$2) as ok',[saved,token]))[0].ok,true);
  assert.equal((await rows(seeker,'select frequency from saved_searches'))[0].frequency,'off');
 });
 await t.test('the service role sees only publicly listed jobs through search',async()=>{
  await admin("update companies set verified_at=null where name='Other company'");
  const r=await rows('service',"select job_id from jp_search_jobs(p_query=>'nurse')");
  assert.deepEqual(r.map(x=>x.job_id),[ids.job]);
 });
 await db.close();
});
