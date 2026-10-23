import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {owner,recruiter,manager,seeker,other,admin:adminId,company,job,resume,foreignCompany}=ids;
const media=`https://x.supabase.co/storage/v1/object/public/company-media/${company}/logo.png`;
test('employer portal',async t=>{
 const {db,rows,command,admin}=await createDb();
 await t.test('company profile accepts only its own uploaded media and only from the owner',async()=>{
  await assert.rejects(()=>rows(recruiter,'select jp_company_profile($1,$2::jsonb)',[company,JSON.stringify({industry:'Health'})]),/owner required/);
  await assert.rejects(()=>rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,JSON.stringify({logoUrl:'https://evil.example/x.png'})]),/uploaded through JobRoles/);
  await assert.rejects(()=>rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,JSON.stringify({logoUrl:media.replace(company,foreignCompany)})]),/uploaded through JobRoles/);
  await rows(owner,'select jp_company_profile($1,$2::jsonb)',[company,JSON.stringify({logoUrl:media,industry:'Health care',sizeBand:'201-500',headquarters:'Frankston VIC',foundedYear:'1998',website:'https://bayside.example',pitch:'Care close to home.',benefits:['Salary packaging','  ','Free parking'],photos:[media]})]);
  const [c]=await rows(null,'select logo_url,industry,size_band,founded_year,benefits,photos from companies where id=$1',[company]);
  assert.deepEqual(c,{logo_url:media,industry:'Health care',size_band:'201-500',founded_year:1998,benefits:['Salary packaging','Free parking'],photos:[media]});
 });
 await t.test('screening questions can be replaced until someone applies',async()=>{
  const qs=[{question:'Do you hold AHPRA registration?',mustHave:true,expected:'Yes'},{question:'Can you work night shifts?',mustHave:false}];
  await assert.rejects(()=>rows(manager,'select jp_set_screening($1,$2::jsonb)',[job,JSON.stringify(qs)]),/access denied/);
  assert.equal((await rows(owner,'select jp_set_screening($1,$2::jsonb) as r',[job,JSON.stringify(qs)]))[0].r.count,2);
  const q=await rows(null,'select id,question from screening_questions where job_id=$1 order by position',[job]);assert.equal(q.length,2);
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[q[0].id]:'No',[q[1].id]:'Yes'},cover:''});
  await assert.rejects(()=>rows(owner,'select jp_set_screening($1,$2::jsonb)',[job,JSON.stringify(qs)]),/fixed once people have applied/);
 });
 await t.test('pipeline flags unmet requirements and counts unread candidate messages',async()=>{
  const [app]=await admin('select id from applications where job_id=$1',[job]);
  await command(seeker,'message.send',{id:app.id,body:'Happy to share my registration number.'});
  let [p]=await rows(recruiter,'select * from jp_pipeline($1)',[job]);
  assert.equal(p.full_name,'Sam Seeker');assert.equal(p.meets_requirements,false);assert.equal(Number(p.unread),1);
  await rows(recruiter,'select jp_mark_read($1)',[app.id]);[p]=await rows(recruiter,'select * from jp_pipeline($1)',[job]);assert.equal(Number(p.unread),0);
  await assert.rejects(()=>rows(other,'select * from jp_pipeline($1)',[job]),/access denied/);
  const inbox=await rows(owner,'select * from jp_inbox($1)',[company]);assert.equal(inbox[0].last_from_candidate,true);assert.equal(Number(inbox[0].unread),1);
 });
 await t.test('bulk moves send one message each and respect permissions',async()=>{
  const [app]=await admin('select id from applications where job_id=$1',[job]);
  await assert.rejects(()=>rows(manager,"select jp_bulk_move($1,'rejected')",[[app.id]]),/denied/);
  await rows(recruiter,"select jp_bulk_move($1,'shortlisted',$2)",[[app.id],'Thanks, we would like to talk further.']);
  assert.equal((await admin('select stage::text from applications where id=$1',[app.id]))[0].stage,'shortlisted');
  assert.equal((await admin("select count(*)::int n from application_messages where body like 'Thanks, we would%'"))[0].n,1);
 });
 await t.test('templates belong to the company team',async()=>{
  await rows(recruiter,"select jp_template('save',$1::jsonb)",[JSON.stringify({companyId:company,name:'Not progressing',body:'Thank you for applying. We will not progress your application this time.'})]);
  assert.equal((await rows(manager,'select name from message_templates')).length,1);
  assert.equal((await rows(other,'select name from message_templates')).length,0);
  await assert.rejects(()=>rows(manager,"select jp_template('save',$1::jsonb)",[JSON.stringify({companyId:company,name:'x2',body:'Some template body text.'})]),/Owner or recruiter/);
 });
 await t.test('candidates pick from proposed interview times',async()=>{
  const [app]=await admin('select id from applications where job_id=$1',[job]);
  const slots=['2030-01-10T23:00:00Z','2030-01-11T01:00:00Z'];
  await assert.rejects(()=>rows(owner,"select jp_propose_interview($1,$2,'Mars/Base','Video')",[app.id,slots]),/valid time zone/);
  const p=(await rows(owner,"select jp_propose_interview($1,$2,'Australia/Melbourne','Video call') as r",[app.id,slots]))[0].r.id;
  await assert.rejects(()=>rows(other,'select jp_choose_slot($1,$2)',[p,slots[0]]),/denied/);
  await assert.rejects(()=>rows(seeker,'select jp_choose_slot($1,$2)',[p,'2030-01-12T00:00:00Z']),/no longer available/);
  await rows(seeker,'select jp_choose_slot($1,$2)',[p,slots[1]]);
  assert.equal((await admin('select stage::text from applications where id=$1',[app.id]))[0].stage,'interview');
  const cal=await rows(manager,"select * from jp_interview_calendar($1,now(),'2031-01-01')",[company]);assert.equal(cal.length,1);assert.equal(cal[0].full_name,'Sam Seeker');
 });
 await t.test('notification preferences filter the email queue and feed the digest',async()=>{
  await rows(owner,'select jp_set_notification_prefs($1::jsonb)',[JSON.stringify({messages:false,dailyDigest:true})]);
  const [app]=await admin('select id from applications where job_id=$1',[job]);
  await admin('delete from private.notification_deliveries');
  await command(seeker,'message.send',{id:app.id,body:'Following up on my application.'});
  const to=(await admin("select recipient_id from private.notification_deliveries where event_type='message.send'")).map(r=>r.recipient_id);
  assert.ok(!to.includes(owner));
  await admin("update notification_prefs set last_digest_at=now()-interval '2 days' where user_id=$1",[owner]);
  const [d]=await rows('service','select * from jp_claim_employer_digests()');assert.equal(d.email,'owner@example.test');assert.equal(d.jobs[0].count,1);
  assert.equal((await rows('service','select * from jp_claim_employer_digests()')).length,0);
 });
 await t.test('team list shows members to the team and invitations to owners only',async()=>{
  const r=(await rows(owner,'select jp_team($1) as r',[company]))[0].r;assert.equal(r.members.length,3);assert.equal(r.isOwner,true);
  assert.equal((await rows(manager,'select jp_team($1) as r',[company]))[0].r.isOwner,false);
  await assert.rejects(()=>rows(other,'select jp_team($1)',[company]),/access denied/);
 });
 await t.test('dashboard summarises the company for its team',async()=>{
  const d=(await rows(owner,'select jp_employer_dashboard($1) as d',[company]))[0].d;
  assert.equal(d.live,1);assert.equal(d.newWeek,1);assert.equal(d.upcoming.length,1);assert.equal(d.upcoming[0].name,'Sam Seeker');
  await assert.rejects(()=>rows(seeker,'select jp_employer_dashboard($1)',[company]),/access denied/);
 });
 await t.test('following a company creates a daily alert; the directory lists verified employers',async()=>{
  await rows(seeker,'select jp_follow_company($1,true)',[company]);
  assert.equal((await rows(seeker,'select jp_is_following($1) as f',[company]))[0].f,true);
  assert.deepEqual((await rows(seeker,'select filters,frequency from saved_searches'))[0],{filters:{company:'Bayside'},frequency:'daily'});
  await rows(seeker,'select jp_follow_company($1,false)',[company]);assert.equal((await rows(seeker,'select jp_is_following($1) as f',[company]))[0].f,false);
  const dir=await rows(null,"select * from jp_company_directory('bay')");assert.equal(dir.length,1);assert.equal(Number(dir[0].live_jobs),1);assert.equal(dir[0].industry,'Health care');
 });
 await t.test('reviews carry category ratings, helpful votes and a distribution',async()=>{
  await rows(seeker,'select jp_submit_review($1,5,$2,$3,$4,4,5,3)',[company,'Fair and fast','Clear steps and a quick reply each time.','Parking was hard to find on the day.']);
  const [r]=await rows(adminId,'select id from jp_pending_reviews()');await rows(adminId,"select jp_moderate_review($1,'publish','Meets guidelines')",[r.id]);
  await assert.rejects(()=>rows(seeker,'select jp_mark_helpful($1)',[r.id]),/not available/);
  await rows(other,'select jp_mark_helpful($1)',[r.id]);await rows(other,'select jp_mark_helpful($1)',[r.id]);
  assert.equal((await rows(null,'select helpful_count from company_reviews'))[0].helpful_count,1);
  const rating=(await rows(null,'select jp_company_rating($1) as r',[company]))[0].r;
  assert.deepEqual([rating.average,rating.distribution['5'],rating.communication,rating.fairness,rating.speed],[5,1,4,5,3]);
 });
 await t.test('job extras validate links and send changed live roles back to review',async()=>{
  await assert.rejects(()=>rows(owner,'select jp_job_extras($1,$2::jsonb)',[job,JSON.stringify({externalApplyUrl:'http://x.example'})]),/https/);
  await rows(owner,'select jp_job_extras($1,$2::jsonb)',[job,JSON.stringify({benefits:['Salary packaging'],startDate:'2026-12-01',externalApplyUrl:'https://careers.bayside.example/rn'})]);
  assert.deepEqual((await admin('select state::text,benefits,start_date::text from jobs where id=$1',[job]))[0],{state:'pending_review',benefits:['Salary packaging'],start_date:'2026-12-01'});
 });
 await db.close();
});
