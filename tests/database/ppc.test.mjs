import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {owner,recruiter,manager,seeker,company,job}=ids;
const visitor=n=>`visitor-${String(n).padStart(12,'0')}`;
test('pay-per-click campaigns',async t=>{
 const {rows}=await createDb();
 const sponsored=async()=>(await rows(null,'select * from jp_active_sponsorships($1)',[[job]])).length===1;
 const click=async n=>(await rows('service','select jp_record_sponsored_click($1,$2) as r',[job,visitor(n)]))[0].r;
 await t.test('only owners and recruiters set campaigns, within limits',async()=>{
  await assert.rejects(()=>rows(manager,'select jp_set_campaign($1,1000,100,true)',[job]),/Employer access/);
  await assert.rejects(()=>rows(seeker,'select jp_set_campaign($1,1000,100,true)',[job]),/Employer access/);
  await assert.rejects(()=>rows(owner,'select jp_set_campaign($1,1000,5000,true)',[job]),/daily budget/);
  await rows(recruiter,'select jp_set_campaign($1,1000,300,true)',[job]);
  assert.equal(await sponsored(),false,'no credit means no lift');
 });
 await t.test('credit is recorded once per Stripe session and is private to the team',async()=>{
  await assert.rejects(()=>rows(owner,"select jp_record_ad_credit('cs_1',$1,$2,500)",[company,owner]),/permission denied/);
  await rows('service',"select jp_record_ad_credit('cs_1',$1,$2,500)",[company,owner]);
  await rows('service',"select jp_record_ad_credit('cs_1',$1,$2,500)",[company,owner]);
  assert.equal((await rows(owner,'select jp_ad_account($1) as a',[company]))[0].a.balance,500);
  await assert.rejects(()=>rows(manager,'select jp_ad_account($1)',[company]),/Employer access/);
  assert.equal((await rows(seeker,'select * from ad_credit_ledger')).length,0);
  assert.equal(await sponsored(),true);
 });
 await t.test('clicks are charged once per visitor per day until credit or budget runs out',async()=>{
  assert.deepEqual(await click(1),{charged:true,cost:300});
  assert.deepEqual(await click(1),{charged:false},'repeat visitor is free');
  assert.equal((await rows(owner,'select jp_ad_account($1) as a',[company]))[0].a.balance,200);
  assert.equal(await sponsored(),false,'balance below one click stops the lift');
  assert.deepEqual(await click(2),{charged:false});
  await rows('service',"select jp_record_ad_credit('cs_2',$1,$2,5000)",[company,owner]);
  assert.deepEqual(await click(3),{charged:true,cost:300});
  assert.deepEqual(await click(4),{charged:true,cost:300});
  assert.equal(await sponsored(),false,'daily budget of $10 cannot fit a fourth $3 click');
  const acct=(await rows(owner,'select jp_ad_account($1) as a',[company]))[0].a;
  assert.deepEqual([acct.balance,acct.jobs[0].spentToday,acct.jobs[0].clicks7],[4600,900,3]);
  await assert.rejects(()=>rows(null,'select jp_record_sponsored_click($1,$2)',[job,visitor(9)]),/permission denied/);
 });
 await t.test('pausing stops the lift and the charges',async()=>{
  await rows(owner,'select jp_set_campaign($1,5000,300,false)',[job]);
  assert.equal(await sponsored(),false);assert.deepEqual(await click(5),{charged:false});
 });
});
