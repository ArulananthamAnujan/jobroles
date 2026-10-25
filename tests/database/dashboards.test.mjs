import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,owner,manager,other,admin:adminId,company,job,resume,question}=ids;
const row=(o={})=>({title:'Enrolled Nurse',description:'Provide person-centred care across our aged care wing with a supportive team.',locations:['Mornington VIC'],type:'Part-time',arrangement:'on_site',min:39,max:45,period:'hour',...o});
test('dashboards and bulk import',async t=>{
 const {rows,command,admin}=await createDb();
 await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
 await admin("update applications set submitted_at=now()-interval '5 days'");
 await t.test('the hiring overview shows the pipeline, who is waiting and the response record',async()=>{
  const o=(await rows(owner,'select jp_hiring_overview($1) as o',[company]))[0].o;
  assert.equal(o.pipeline[0].new,1);assert.equal(o.pipeline[0].oldestNewDays,5);
  assert.equal(o.waiting[0].name,'Sam Seeker');assert.deepEqual([o.waitingTotal,o.waitingOver3],[1,1]);
  assert.equal(o.daily.length,30);assert.equal(o.daily.reduce((n,d)=>n+d.count,0),1);
  assert.deepEqual([o.response.applications,o.response.responded,o.response.public],[1,0,false]);
  await assert.rejects(()=>rows(other,'select jp_hiring_overview($1)',[company]),/denied/);
 });
 await t.test('the seeker home lists applications with their stage and next step',async()=>{
  const h=(await rows(seeker,'select jp_seeker_home() as h'))[0].h;
  assert.equal(h.applications.length,1);assert.equal(h.applications[0].stage,'new');assert.equal(h.applications[0].company,'Bayside');
  assert.equal(h.profile.resume,true);
  assert.equal((await rows(other,'select jp_seeker_home() as h'))[0].h.applications.length,0);
 });
 await t.test('the admin overview counts every queue',async()=>{
  await assert.rejects(()=>rows(owner,'select jp_admin_overview()'),/Administrator/);
  const a=(await rows(adminId,'select jp_admin_overview() as a'))[0].a;
  assert.deepEqual(a.queues.map(q=>q.id),['jobs','companies','reports','reviews','community','flagged','support']);
  assert.equal(a.daily.length,14);assert.equal(a.totals.liveJobs,2);
 });
 await t.test('bulk import saves good rows and explains bad ones',async()=>{
  await assert.rejects(()=>rows(manager,'select jp_bulk_import_jobs($1,$2)',[company,JSON.stringify([row()])]),/Owners and recruiters/);
  const r=(await rows(owner,'select jp_bulk_import_jobs($1,$2,true) as r',[company,JSON.stringify([row(),row({description:'Too short'}),row({locations:[]}),row({title:'Cook',benefits:['Free meals'],externalApplyUrl:''})])]))[0].r;
  assert.deepEqual([r.saved,r.failed],[2,2]);
  assert.deepEqual(r.results.map(x=>x.ok),[true,false,false,true]);assert.match(r.results[1].error,/description/);assert.match(r.results[2].error,/location/);
  assert.equal(r.results[0].state,'pending_review');
  assert.equal((await admin("select count(*)::int n from jobs where title in ('Enrolled Nurse','Cook')"))[0].n,2);
  assert.deepEqual((await admin("select benefits from jobs where title='Cook'"))[0].benefits,['Free meals']);
  await assert.rejects(()=>rows(owner,'select jp_bulk_import_jobs($1,$2)',[company,JSON.stringify(Array(201).fill(row()))]),/between 1 and 200/);
 });
});
