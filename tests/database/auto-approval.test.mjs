// Companies are verified and jobs go live automatically when the checks pass (migration 20261113000001_automatic_approval).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids,uid} from './harness.mjs';
const {other,seeker}=ids;
const good=uid(801),copy=uid(802),typo=uid(803),fresh=uid(804),agency=uid(805),none=uid(806);
const jobSql=`insert into public.jobs(id,company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period) values($1,$2,$3,$4,'pending_review','Full-time','on_site',70000,80000,'year')`;
const plain='Lead the day shift in our Parramatta warehouse, run rosters and keep the team safe and on time.';
test('automatic approval',async t=>{
 const {rows,admin}=await createDb();
 const run=async who=>(await rows(who,'select jp_auto_approve() as r'))[0].r;
 const verified=async id=>(await admin('select verified_at from companies where id=$1',[id]))[0].verified_at!==null;
 const state=async id=>(await admin('select state from jobs where id=$1',[id]))[0].state;
 await t.test('the ABN check accepts real ABNs and rejects typing mistakes',async()=>{
  const r=(await admin("select private.valid_abn('51824753556') a,private.valid_abn('33051775556') b,private.valid_abn('51824753557') c,private.valid_abn('5182475355') d,private.valid_abn(null) e"))[0];
  assert.deepEqual(r,{a:true,b:true,c:false,d:false,e:false});
 });
 await t.test('a company is verified a minute after registering when its ABN is valid and nobody else uses it',async()=>{
  await admin(`insert into public.companies(id,name,abn,is_agency,created_at) values
   ($1,'Good Co','33051775556',false,now()-interval '2 minutes'),($2,'Copycat','51824753556',false,now()-interval '2 minutes'),($3,'Copied','51824753556',false,now()-interval '2 minutes'),
   ($4,'Typo Co','33051775557',false,now()-interval '2 minutes'),($5,'Fresh Co','53004085616',false,now()),($6,'Agency Co','11000000948',true,now()-interval '2 minutes'),($7,'No ABN Co',null,false,now()-interval '2 minutes')`,[good,copy,uid(899),typo,fresh,agency,none]);
  assert.equal((await admin("select private.valid_abn('53004085616') a,private.valid_abn('11000000948') b"))[0].a,true);
  await run(other);
  assert.equal(await verified(good),true);
  assert.equal(await verified(copy),false,'an ABN used by two companies waits for a person');
  assert.equal(await verified(typo),false);assert.equal(await verified(none),false);
  assert.equal(await verified(fresh),false,'not before one minute has passed');
  assert.equal((await admin("select count(*)::int n from audit_log where action='company.auto_verified' and entity_id=$1 and actor_id is null",[good]))[0].n,1);
 });
 await t.test('a job goes live one minute after it is sent for approval, and not before',async()=>{
  const j=uid(810);await admin(jobSql,[j,good,'Warehouse Supervisor',plain]);
  assert.ok((await admin('select review_requested_at from jobs where id=$1',[j]))[0].review_requested_at,'the time it was sent is recorded');
  await run(seeker);assert.equal(await state(j),'pending_review');
  await admin("update jobs set review_requested_at=now()-interval '61 seconds' where id=$1",[j]);
  assert.equal((await run(seeker)).jobs,1);
  const row=(await admin("select state,published_at is not null p,expires_at>now()+interval '29 days' e from jobs where id=$1",[j]))[0];
  assert.deepEqual(row,{state:'live',p:true,e:true});
  assert.equal((await admin("select count(*)::int n from audit_log where action='job.auto_approved' and entity_id=$1",[j]))[0].n,1);
  assert.equal((await run(seeker)).jobs,0,'running it again changes nothing');
 });
 await t.test('jobs that the scam checks flag, or from unverified, suspended or agency employers, wait for a person',async()=>{
  const flagged=uid(811),unverified=uid(812),agent=uid(813),suspended=uid(814);
  await admin(jobSql,[flagged,good,'Warehouse Supervisor',plain]);await admin(jobSql,[unverified,typo,'Warehouse Supervisor',plain]);await admin(jobSql,[agent,agency,'Warehouse Supervisor',plain]);
  await admin("insert into private.job_risk(job_id,flags) values($1,array['asks for payment']) on conflict(job_id) do update set flags=excluded.flags",[flagged]);
  await admin("update companies set verified_at=now() where id=$1",[agency]);
  await admin("update jobs set review_requested_at=now()-interval '5 minutes' where id=any($1)",[[flagged,unverified,agent]]);
  await run(other);
  assert.deepEqual([await state(flagged),await state(unverified),await state(agent)],['pending_review','pending_review','pending_review']);
  await admin(jobSql,[suspended,good,'Storeperson',plain]);await admin("update jobs set review_requested_at=now()-interval '5 minutes' where id=$1",[suspended]);
  await admin('update companies set suspended_at=now() where id=$1',[good]);await run(other);assert.equal(await state(suspended),'pending_review');
 });
 await t.test('editing a live job sends it round again with a new one-minute wait',async()=>{
  await admin('update companies set suspended_at=null where id=$1',[good]);
  const j=uid(810);const before=(await admin('select review_requested_at from jobs where id=$1',[j]))[0].review_requested_at;
  await admin("update jobs set state='pending_review' where id=$1",[j]);
  assert.ok((await admin('select review_requested_at from jobs where id=$1',[j]))[0].review_requested_at>before);
  await run(other);assert.equal(await state(j),'pending_review');
 });
 await t.test('with the ABN register connected, a company is verified only when the register says active and the name matches',async()=>{
  const {admin:adm}=ids;
  await admin('insert into private.platform_admins(user_id) values($1) on conflict do nothing',[adm]);
  await assert.rejects(()=>rows(other,"select jp_set_abn_register_key('11111111-2222-3333-4444-555555555555')"),/Administrator required/);
  await assert.rejects(()=>rows(adm,"select jp_set_abn_register_key('not-a-key')"),/does not look like/);
  await rows(adm,"select jp_set_abn_register_key('11111111-2222-3333-4444-555555555555')");
  // Stand in for the register: answers by ABN in the same shape the real service uses.
  await admin(`create or replace function private.abr_fetch(abn text,guid text) returns text language sql as $f$ select case abn
   when '80000000001' then 'callback({"Abn":"80000000001","AbnStatus":"Active","EntityName":"HARBOUR FREIGHT PTY LTD","BusinessName":["Harbour Freight Logistics"],"EntityTypeName":"Australian Private Company","AddressState":"NSW","AddressPostcode":"2150","Message":""})'
   when '80000000033' then 'callback({"Abn":"80000000033","AbnStatus":"Cancelled","EntityName":"OLD TRADING CO PTY LTD","BusinessName":[],"Message":""})'
   when '80000000065' then 'callback({"Abn":"80000000065","AbnStatus":"Active","EntityName":"SMITH PLUMBING PTY LTD","BusinessName":[],"Message":""})'
   when '80000000097' then 'callback({"Abn":"","AbnStatus":"","EntityName":"","BusinessName":[],"Message":"Search text is not a valid ABN or ACN"})'
   else null end $f$`);
  const abns=(await admin("select string_agg(a,',') s from unnest(array['80000000001','80000000033','80000000065','80000000097','80000000114']) a where private.valid_abn(a)"))[0].s;
  assert.equal(abns,'80000000001,80000000033,80000000065,80000000097,80000000114','the sample ABNs are well formed');
  const [real,cancelled,stolen,unknown,down]=[uid(821),uid(822),uid(823),uid(824),uid(825)];
  await admin(`insert into public.companies(id,name,abn,created_at) values($1,'Harbour Freight','80000000001',now()-interval '2 minutes'),($2,'Old Trading Co','80000000033',now()-interval '2 minutes'),
   ($3,'Kumar Building Supplies','80000000065',now()-interval '2 minutes'),($4,'Nowhere Ltd','80000000097',now()-interval '2 minutes'),($5,'Unlucky Co','80000000114',now()-interval '2 minutes')`,[real,cancelled,stolen,unknown,down]);
  for(const id of [real,cancelled,stolen,unknown,down])await admin("insert into public.company_memberships(company_id,user_id,role) values($1,$2,'owner')",[id,other]);
  await run(other);await run(other);
  assert.deepEqual([await verified(real),await verified(cancelled),await verified(stolen),await verified(unknown),await verified(down)],[true,false,false,false,false]);
  const why=async id=>(await rows(other,'select jp_abn_check($1) as r',[id]))[0].r;
  assert.equal((await why(real)).state,'verified');assert.equal((await why(cancelled)).state,'cancelled');assert.equal((await why(unknown)).state,'not_found');assert.equal((await why(down)).state,'checking');
  assert.deepEqual([(await why(stolen)).state,(await why(stolen)).registeredName],['name_mismatch','SMITH PLUMBING PTY LTD']);
  await assert.rejects(()=>rows(seeker,'select jp_abn_check($1)',[real]),/Company not found/);
  assert.match((await admin("select reason from audit_log where action='company.auto_verified' and entity_id=$1",[real]))[0].reason,/ABN register: active, registered to HARBOUR FREIGHT PTY LTD/);
  const status=(await rows(adm,'select jp_abn_register_status() as r'))[0].r;assert.equal(status.connected,true);assert.equal(Number(status.checked),4);assert.equal(Number(status.failing),1);
  await assert.rejects(()=>rows(other,'select jp_abn_register_status()'),/Administrator required/);
  // The register is asked once per ABN, not on every run.
  assert.equal((await admin("select attempts from private.abn_checks where abn='80000000001'"))[0].attempts,1);
 });
 await t.test('visitors who are not signed in cannot trigger it',async()=>{
  await assert.rejects(()=>rows(null,'select jp_auto_approve()'),/permission denied/);
 });
});
