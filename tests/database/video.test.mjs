import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,owner,other,manager,job,resume,question}=ids;
test('video interview rooms',async t=>{
 const {rows,command,admin}=await createDb();
 await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
 const [{id:app}]=await admin('select id from applications limit 1');
 const book=async offset=>(await admin(`insert into interviews(application_id,starts_at,time_zone,format,created_by) values($1,now()+$2::interval,'Australia/Melbourne','JobRoles video call',$3) returning id`,[app,offset,owner]))[0].id;
 const now=await book('10 minutes'),later=await book('2 days');
 await t.test('only the applicant and the hiring team can see the room',async()=>{
  assert.equal((await rows(seeker,'select jp_video_room($1) as r',[now]))[0].r.side,'candidate');
  assert.equal((await rows(manager,'select jp_video_room($1) as r',[now]))[0].r.side,'employer');
  await assert.rejects(()=>rows(other,'select jp_video_room($1)',[now]),/unavailable/);
  await assert.rejects(()=>rows(null,'select jp_video_room($1)',[now]),/permission denied/);
 });
 await t.test('signals relay between peers only while the room is open',async()=>{
  await assert.rejects(()=>rows(seeker,"select jp_video_signal($1,'cand-peer-1','hello','{}')",[later]),/opens 30 minutes/);
  await assert.rejects(()=>rows(other,"select jp_video_signal($1,'evil-peer-1','hello','{}')",[now]),/unavailable/);
  await rows(seeker,"select jp_video_signal($1,'cand-peer-1','hello','{}')",[now]);
  const seen=await rows(owner,"select * from jp_video_poll($1,'boss-peer-1',0)",[now]);
  assert.deepEqual(seen.map(s=>[s.kind,s.side,s.peer]),[['hello','candidate','cand-peer-1']]);
  await rows(owner,`select jp_video_signal($1,'boss-peer-1','offer','{"to":"cand-peer-1","sdp":"v=0"}')`,[now]);
  await rows(owner,`select jp_video_signal($1,'boss-peer-1','offer','{"to":"someone-else","sdp":"v=0"}')`,[now]);
  const mine=await rows(seeker,"select * from jp_video_poll($1,'cand-peer-1',0)",[now]);
  assert.deepEqual(mine.map(s=>[s.kind,s.side,s.payload.sdp]),[['offer','employer','v=0']],'own messages and other peers’ messages are not returned');
  const after=mine.at(-1).id;assert.equal((await rows(seeker,"select * from jp_video_poll($1,'cand-peer-1',$2)",[now,after])).length,0);
  await assert.rejects(()=>rows(seeker,"select jp_video_signal($1,'cand-peer-1','shout','{}')",[now]),/check/);
  await assert.rejects(()=>rows(seeker,'select * from interview_signals'),/permission denied/);
 });
 await t.test('cancelled interviews close the room',async()=>{
  await admin('update interviews set cancelled_at=now() where id=$1',[now]);
  await assert.rejects(()=>rows(seeker,"select jp_video_signal($1,'cand-peer-1','hello','{}')",[now]),/cancelled/);
 });
});
