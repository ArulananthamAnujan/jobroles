import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids,uid} from './harness.mjs';
const {seeker,other,owner,admin:adminId,company,job}=ids;
const wp=(o={})=>({rating:4,title:'Supportive team',pros:'Good rosters and a caring manager.',cons:'Parking is hard to find.',jobTitle:'Registered Nurse',status:'current',...o});
test('operations',async t=>{
 const {rows,admin}=await createDb();
 await admin("update auth.users set created_at=now()-interval '30 days'");
 await t.test('content checks flag contact details, links and abuse',async()=>{
  const f=async s=>(await admin('select private.content_flags($1) as f',[s]))[0].f;
  assert.deepEqual(await f('Call me on 0412 345 678 or jo@example.com'),['email address','phone number']);
  assert.deepEqual(await f('See www.example.com'),['link']);assert.deepEqual(await f('The manager is a bastard'),['offensive language']);
  assert.deepEqual(await f('Friendly team and fair rosters.'),[]);
 });
 await t.test('flagged posts wait; clean posts auto-publish only when switched on',async()=>{
  await rows(seeker,'select jp_submit_workplace_review($1,$2)',[company,wp({cons:'Email jo@example.com for the truth.'})]);
  let r=(await admin("select status,flags from company_reviews where kind='workplace'"))[0];assert.deepEqual([r.status,r.flags],['pending',['email address']]);
  await assert.rejects(()=>rows(owner,'select jp_set_auto_publish(true)'),/Administrator/);
  await rows(adminId,'select jp_set_auto_publish(true)');
  await rows(other,'select jp_submit_workplace_review($1,$2)',[company,wp()]);
  r=(await admin("select status from company_reviews where author_id=$1",[other]))[0];assert.equal(r.status,'published');
  const fresh=uid(41);await admin("insert into auth.users(id,email) values($1,'new@example.test')",[fresh]);
  await rows(fresh,'select jp_ask_question($1,$2)',[company,'What are the rosters like for new graduates?']);
  assert.equal((await admin('select status from company_questions'))[0].status,'pending','brand-new accounts always wait');
  await rows(adminId,'select jp_set_auto_publish(false)');
  const pending=await rows(adminId,'select * from jp_pending_reviews()');assert.deepEqual(pending[0].flags,['email address']);
  assert.equal((await rows(adminId,"select jp_bulk_moderate('review',$1,'reject','Contains contact details') as n",[[pending[0].id]]))[0].n,1);
 });
 await t.test('published posts can be reported and taken down',async()=>{
  const [{id}]=await admin("select id from company_reviews where status='published'");
  await assert.rejects(()=>rows(null,"select jp_report_content('review',$1,'false')",[id]),/permission denied/);
  await rows(seeker,"select jp_report_content('review',$1,'personal','Names a staff member')",[id]);
  const q=(await rows(adminId,'select jp_content_reports() as q'))[0].q;assert.equal(q[0].reports,1);
  await rows(adminId,"select jp_resolve_report('review',$1,true,'Names an individual')",[id]);
  assert.equal((await admin('select status from company_reviews where id=$1',[id]))[0].status,'rejected');
  assert.equal((await rows(adminId,'select jp_content_reports() as q'))[0].q.length,0);
 });
 await t.test('invalid clicks are recorded but not charged, and credit can be refunded',async()=>{
  await rows(owner,'select jp_set_campaign($1,10000,100,true)',[job]);await rows('service',"select jp_record_ad_credit('cs_ops',$1,$2,5000)",[company,owner]);
  const click=async(v,n)=>(await rows('service','select jp_record_sponsored_click($1,$2,$3) as r',[job,v,n]))[0].r;
  for(let i=0;i<5;i++)assert.equal((await click(`visitor-${i}-xxxxxxxxxxxx`,'net-a')).charged,true);
  const sixth=await click('visitor-6-xxxxxxxxxxxx','net-a');assert.deepEqual([sixth.charged,sixth.invalid],[false,'Many clicks from one network']);
  const acct=(await rows(owner,'select jp_ad_account($1) as a',[company]))[0].a;assert.deepEqual([acct.balance,acct.invalid7,acct.jobs[0].clicks7],[4500,1,5]);
  await assert.rejects(()=>rows(owner,"select jp_refund_credit($1,500,'Bot clicks')",[company]),/Administrator/);
  await rows(adminId,"select jp_refund_credit($1,500,'Bot clicks reported by employer')",[company]);
  assert.equal((await rows(owner,'select jp_ad_account($1) as a',[company]))[0].a.balance,5000);
  assert.equal((await rows(adminId,'select jp_click_quality() as q'))[0].q[0].invalid,1);
 });
 await t.test('anyone can open a support ticket; only admins see the queue',async()=>{
  await assert.rejects(()=>rows(null,"select jp_submit_ticket('bad','A','account','too short')"),/valid email/);
  await rows(null,"select jp_submit_ticket('visitor@example.com','Vi','job','I think this job ad is a scam, please check it.')");
  await rows(seeker,"select jp_submit_ticket('ignored@example.com',null,'account','I cannot change my email address in settings.')");
  assert.equal((await admin("select email from support_tickets where user_id=$1",[seeker]))[0].email,'seeker@example.test','signed-in tickets use the account email');
  await assert.rejects(()=>rows(seeker,'select jp_support_queue()'),/Administrator/);
  const q=(await rows(adminId,'select jp_support_queue() as q'))[0].q;assert.equal(q.length,2);
  await rows(adminId,"select jp_update_ticket($1,'closed','Replied by email')",[q[0].id]);
  assert.equal((await rows(adminId,'select jp_support_queue() as q'))[0].q.length,1);
  assert.equal((await rows(seeker,'select status from support_tickets')).length,1);
 });
});
