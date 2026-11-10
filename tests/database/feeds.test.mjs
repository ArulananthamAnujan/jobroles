import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {owner,recruiter,admin:adminId,company,other}=ids;
const item=(id,extra={})=>({externalId:id,title:`Role ${id}`,description:'A real role with a supportive team and clear duties every day.',type:'Full-time',arrangement:'hybrid',locations:['Geelong VIC'],min:80000,max:90000,period:'year',...extra});
test('job feed import',async t=>{
 const {db,rows,admin}=await createDb();
 let feed;
 await t.test('only a verified company owner can add a feed',async()=>{
  await assert.rejects(()=>rows(recruiter,"select jp_feed_command('create',$1::jsonb)",[JSON.stringify({companyId:company,url:'https://ats.example/feed.json',format:'json'})]),/owner required/);
  await assert.rejects(()=>rows(owner,"select jp_feed_command('create',$1::jsonb)",[JSON.stringify({companyId:company,url:'http://ats.example/feed',format:'json'})]),/https feed address/);
  feed=(await rows(owner,"select jp_feed_command('create',$1::jsonb) as r",[JSON.stringify({companyId:company,url:'https://ats.example/feed.json',format:'json'})]))[0].r.id;
  assert.equal((await rows(recruiter,'select id from job_feeds')).length,1);
  assert.equal((await rows(other,'select id from job_feeds')).length,0);
  await assert.rejects(()=>rows(owner,'select lease from job_feeds'),/permission denied/);
 });
 await t.test('imports need a lease; half a pay range is rejected; new roles await review',async()=>{
  await assert.rejects(()=>rows(owner,'select * from jp_claim_job_feeds()'),/permission denied/);
  const [claim]=await rows('service','select * from jp_claim_job_feeds()');assert.equal(claim.id,feed);
  assert.equal((await rows('service','select * from jp_claim_job_feeds()')).length,0);
  const r=(await rows('service','select jp_import_feed($1,$2,$3::jsonb) as r',[feed,claim.lease,JSON.stringify([item('a'),item('b'),item('c',{min:null}),item('a')])]))[0].r;
  assert.deepEqual(r,{created:2,updated:0,closed:0,rejected:2});
  assert.deepEqual((await admin("select distinct state::text from jobs where title like 'Role %'")).map(x=>x.state),['pending_review']);
  assert.equal((await admin("select latitude is not null as placed from job_locations l join jobs j on j.id=l.job_id where j.title='Role a'"))[0].placed,true);
  await assert.rejects(()=>rows('service','select jp_import_feed($1,$2,$3::jsonb)',[feed,claim.lease,'[]']),/lease expired/);
 });
 await t.test('a trusted feed publishes, updates in place and closes roles that leave the feed',async()=>{
  await assert.rejects(()=>rows(owner,"select jp_feed_command('trust',$1::jsonb)",[JSON.stringify({id:feed,autoPublish:true})]),/Administrator/);
  await rows(adminId,"select jp_feed_command('trust',$1::jsonb)",[JSON.stringify({id:feed,autoPublish:true})]);
  await admin("update job_feeds set last_run_at=now()-interval '2 hours'");
  const [claim]=await rows('service','select * from jp_claim_job_feeds()');
  const r=(await rows('service','select jp_import_feed($1,$2,$3::jsonb) as r',[feed,claim.lease,JSON.stringify([item('a',{max:95000}),item('d')])]))[0].r;
  assert.deepEqual(r,{created:1,updated:1,closed:1,rejected:0});
  const states=Object.fromEntries((await admin("select title,state::text from jobs where title like 'Role %'")).map(x=>[x.title,x.state]));
  assert.deepEqual(states,{'Role a':'pending_review','Role b':'closed','Role d':'live'});
  assert.equal((await rows(null,"select id from jobs where title='Role d'")).length,1);
 });
 await t.test('a failed fetch records the error without touching roles',async()=>{
  await admin("update job_feeds set last_run_at=now()-interval '2 hours'");
  const [claim]=await rows('service','select * from jp_claim_job_feeds()');
  await rows('service','select jp_import_feed($1,$2,null,$3)',[feed,claim.lease,'HTTP 500']);
  const [f]=await rows(owner,'select last_status,last_error from job_feeds');assert.deepEqual(f,{last_status:'failed',last_error:'HTTP 500'});
  assert.equal((await admin("select state::text from jobs where title='Role d'"))[0].state,'live');
 });
 await t.test('deleting a feed closes its roles',async()=>{
  await rows(owner,"select jp_feed_command('delete',$1::jsonb)",[JSON.stringify({id:feed})]);
  assert.equal((await admin("select count(*)::int n from jobs where title like 'Role %' and state<>'closed'"))[0].n,0);
 });
 await db.close();
});
test('Greenhouse and Lever feeds can be added',async()=>{
 const {db,rows}=await createDb();
 for(const [format,url] of [['greenhouse','https://boards-api.greenhouse.io/v1/boards/bayside/jobs?content=true'],['lever','https://api.lever.co/v0/postings/bayside?mode=json']])
  assert.ok((await rows(owner,"select jp_feed_command('create',$1::jsonb) as r",[JSON.stringify({companyId:company,url,format})]))[0].r.id);
 await assert.rejects(()=>rows(owner,"select jp_feed_command('create',$1::jsonb)",[JSON.stringify({companyId:company,url:'https://x.example/f',format:'workday'})]),/format/);
 await db.close();
});
test('sourced employers: administrators list a careers feed for an employer that has not joined',async t=>{
 const {rows,admin}=await createDb();
 const src={name:'Harbour Health',website:'https://harbour.example',url:'https://boards-api.greenhouse.io/v1/boards/harbour/jobs?content=true',format:'greenhouse'};
 const item=(id,extra={})=>({externalId:id,title:`Nurse ${id}`,description:'A real role with a supportive team and clear duties every day.',type:'Full-time',arrangement:'hybrid',locations:['Geelong VIC'],min:null,max:null,period:null,applyUrl:`https://harbour.example/jobs/${id}`,...extra});
 let made;
 await t.test('only administrators can add a source',async()=>{
  await assert.rejects(()=>rows(owner,"select jp_source_command('create',$1::jsonb)",[JSON.stringify(src)]),/Administrator required/);
  await assert.rejects(()=>rows(owner,'select jp_sources()'),/Administrator required/);
  await assert.rejects(()=>rows(adminId,"select jp_source_command('create',$1::jsonb)",[JSON.stringify({...src,name:'Bayside'})]),/already has an account/);
  made=(await rows(adminId,"select jp_source_command('create',$1::jsonb) as r",[JSON.stringify(src)]))[0].r;
  await assert.rejects(()=>rows(adminId,"select jp_source_command('create',$1::jsonb)",[JSON.stringify(src)]),/already listed/);
  assert.deepEqual((await admin('select sourced,verified_at is not null as listed,abn from companies where id=$1',[made.companyId]))[0],{sourced:true,listed:true,abn:null});
 });
 await t.test('roles go live without pay, link to the employer, and need that link',async()=>{
  const [claim]=await rows('service','select * from jp_claim_job_feeds()');assert.equal(claim.id,made.feedId);
  const r=(await rows('service','select jp_import_feed($1,$2,$3::jsonb) as r',[made.feedId,claim.lease,JSON.stringify([item('a'),item('b',{min:90000,max:100000,period:'year'}),item('c',{applyUrl:undefined}),item('d',{min:90000})])]))[0].r;
  assert.deepEqual(r,{created:2,updated:0,closed:0,rejected:2});
  const jobs=await rows(null,"select title,salary_min,salary_period,external_apply_url from jobs where title like 'Nurse %' order by title");
  assert.deepEqual(jobs.map(j=>[j.title,j.salary_min===null?null:Number(j.salary_min),j.salary_period,j.external_apply_url]),[['Nurse a',null,null,'https://harbour.example/jobs/a'],['Nurse b',90000,'year','https://harbour.example/jobs/b']]);
  assert.equal((await admin("select count(*)::int as n from screening_questions q join jobs j on j.id=q.job_id where j.title like 'Nurse %'"))[0].n,0);
 });
 await t.test('search can be limited to roles that state pay; nobody can apply here',async()=>{
  const all=await rows(null,"select job_id from jp_search_jobs(p_query=>'nurse')");
  const paid=await rows(null,"select job_id from jp_search_jobs(p_query=>'nurse',p_has_pay=>true)");
  assert.equal(all.length-paid.length,1);
  const target=(await admin("select id from jobs where title='Nurse a'"))[0].id;
  await assert.rejects(()=>admin("insert into applications(job_id,seeker_id,state) values($1,$2,'draft')",[target,ids.seeker]),/employer's website/);
 });
 await t.test('the overview counts sourced roles; a feed can be re-run, paused and removed by an administrator',async()=>{
  const o=(await rows(adminId,'select jp_sources() as r'))[0].r;
  assert.equal(o.totals.sourced,2);assert.equal(o.sources.length,1);assert.equal(o.sources[0].live,2);assert.equal(o.sources[0].owners,0);
  await rows(adminId,"select jp_source_command('run',$1::jsonb)",[JSON.stringify({id:made.feedId})]);
  assert.equal((await rows('service','select * from jp_claim_job_feeds()')).length,1);
  await rows(adminId,"select jp_feed_command('pause',$1::jsonb)",[JSON.stringify({id:made.feedId})]);
  await assert.rejects(()=>rows(owner,"select jp_feed_command('delete',$1::jsonb)",[JSON.stringify({id:made.feedId})]),/Feed access denied/);
 });
 await t.test('the employer can claim the company and be verified later',async()=>{
  await assert.rejects(()=>rows(adminId,"select jp_source_command('claim',$1::jsonb)",[JSON.stringify({companyId:made.companyId,email:'nobody@example.test'})]),/No confirmed account/);
  await rows(adminId,"select jp_source_command('claim',$1::jsonb)",[JSON.stringify({companyId:made.companyId,email:'Other@example.test'})]);
  assert.equal((await admin("select role::text from company_memberships where company_id=$1 and user_id=$2",[made.companyId,other]))[0].role,'owner');
  await rows(adminId,"select jp_source_command('verify',$1::jsonb)",[JSON.stringify({companyId:made.companyId,abn:'51824753556',reason:'ABR lookup matched'})]);
  assert.deepEqual((await admin('select sourced,abn from companies where id=$1',[made.companyId]))[0],{sourced:false,abn:'51824753556'});
  await rows(adminId,"select jp_feed_command('delete',$1::jsonb)",[JSON.stringify({id:made.feedId})]);
  assert.equal((await admin("select count(*)::int as n from jobs where title like 'Nurse %' and state='live'"))[0].n,0);
 });
});
