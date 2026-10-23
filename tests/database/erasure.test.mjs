import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,admin:adminId,owner,recruiter,job,resume,question}=ids;
test('account erasure',async t=>{
 const {db,rows,command,admin}=await createDb();
 const app=(await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:'Dear team, my phone is 0400 000 000.'})).id;
 await command(seeker,'message.send',{id:app,body:'My personal email is sam@home.test'});
 await rows(seeker,"select jp_launch_command('search.save',$1::jsonb)",[JSON.stringify({filters:{q:'nurse'}})]);
 await t.test('only service role may erase, and only with an open deletion request',async()=>{
  await assert.rejects(()=>rows(adminId,'select jp_erase_account($1,$2)',[seeker,adminId]),/permission denied/);
  await assert.rejects(()=>rows('service','select jp_erase_account($1,$2)',[seeker,adminId]),/No open deletion request/);
  await rows(seeker,"select jp_privacy_command('create',$1::jsonb)",[JSON.stringify({kind:'deletion',detail:'Please delete my account and data.'})]);
  await assert.rejects(()=>rows('service','select jp_erase_account($1,$2)',[seeker,owner]),/Administrator required/);
 });
 await t.test('erasure de-identifies kept records and removes the rest',async()=>{
  const r=(await rows('service','select jp_erase_account($1,$2) as r',[seeker,adminId]))[0].r;
  assert.deepEqual(r.storageKeys,['test/resume.pdf']);
  const [snap]=await admin('select profile,cover_letter,answers from application_snapshots where application_id=$1',[app]);
  assert.deepEqual(snap,{profile:{redacted:true},cover_letter:'',answers:{}});
  assert.equal((await admin('select state from applications where id=$1',[app]))[0].state,'withdrawn');
  assert.equal((await admin('select body from application_messages where sender_id=$1',[seeker]))[0].body,"[Deleted at the sender's request]");
  for(const table of ['seeker_profiles','saved_searches'])assert.equal((await admin(`select count(*)::int n from ${table} where user_id=$1`,[seeker]))[0].n,0);
  assert.ok((await admin('select deleted_at from resume_versions where id=$1',[resume]))[0].deleted_at);
  assert.equal((await admin("select status from privacy_requests where user_id=$1",[seeker]))[0].status,'responded');
  assert.equal((await rows(recruiter,'select id from resume_versions')).length,0);
  assert.equal((await admin("select count(*)::int n from audit_log where action='account.erase'"))[0].n,1);
 });
 await t.test('snapshots stay immutable outside an erasure',async()=>{
  await assert.rejects(()=>admin("update application_snapshots set cover_letter='x'"),/immutable/);
 });
 await db.close();
});
