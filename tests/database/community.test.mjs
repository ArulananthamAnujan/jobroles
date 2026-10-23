import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids,uid} from './harness.mjs';
const {seeker,other,owner,recruiter,admin:adminId,company}=ids;
const workplace={rating:4,title:'Supportive team',pros:'Good rosters and a caring manager.',cons:'Parking is hard to find.',jobTitle:'Registered Nurse',status:'current',worklife:4,pay:3,security:5,management:4,culture:5,recommends:true};
const interview={jobTitle:'Registered Nurse',experience:'positive',difficulty:3,outcome:'offer_accepted',source:'applied_online',duration:'1-2 weeks',process:'A phone screen, then a panel interview with the nurse unit manager.',questions:['Tell us about a time you escalated a deteriorating patient.'],month:'2026-09'};
test('community content',async t=>{
 const {rows,admin}=await createDb();
 await t.test('anyone outside the team can review the workplace, moderated',async()=>{
  await assert.rejects(()=>rows(owner,'select jp_submit_workplace_review($1,$2)',[company,workplace]),/team members/);
  await assert.rejects(()=>rows(seeker,'select jp_submit_workplace_review($1,$2)',[company,{...workplace,status:'intern'}]),/job title/);
  await assert.rejects(()=>rows(null,'select jp_submit_workplace_review($1,$2)',[company,workplace]),/permission denied/);
  await rows(seeker,'select jp_submit_workplace_review($1,$2)',[company,workplace]);
  await rows(other,'select jp_submit_workplace_review($1,$2)',[company,{...workplace,rating:2,recommends:false,pay:1}]);
  assert.equal((await rows(null,'select jp_workplace_rating($1) as r',[company]))[0].r,null);
  const pending=await rows(adminId,'select * from jp_pending_reviews()');assert.deepEqual(pending.map(p=>p.kind),['workplace','workplace']);
  for(const p of pending)await rows(adminId,"select jp_moderate_review($1,'publish','Meets guidelines')",[p.id]);
  const r=(await rows(null,'select jp_workplace_rating($1) as r',[company]))[0].r;
  assert.deepEqual([r.average,r.count,r.pay,r.recommend],[3,2,2,50]);
  assert.equal((await rows(null,'select jp_company_rating($1) as r',[company]))[0].r,null,'workplace reviews stay out of the hiring rating');
  assert.equal((await rows(null,"select job_title,employment_status from company_reviews where kind='workplace' limit 1"))[0].employment_status,'current');
 });
 await t.test('interview experiences are moderated and summarised',async()=>{
  await assert.rejects(()=>rows(seeker,'select jp_submit_interview($1,$2)',[company,{...interview,process:'short'}]),/30 characters/);
  await assert.rejects(()=>rows(seeker,'select jp_submit_interview($1,$2)',[company,{...interview,questions:Array(11).fill('What would you do here?')}]),/up to 10 questions/);
  await rows(seeker,'select jp_submit_interview($1,$2)',[company,interview]);
  assert.equal((await rows(null,'select id from company_interviews')).length,0);
  await assert.rejects(()=>rows(null,'select author_id from company_interviews'),/permission denied/);
  const [p]=(await rows(adminId,'select jp_pending_community() as q'))[0].q;assert.equal(p.kind,'interview');
  await assert.rejects(()=>rows(owner,"select jp_moderate_community('interview',$1,'publish','Fine')",[p.id]),/Administrator/);
  await rows(adminId,"select jp_moderate_community('interview',$1,'publish','Meets guidelines')",[p.id]);
  const [pub]=await rows(null,'select job_title,questions,interviewed_on from company_interviews');assert.equal(pub.questions.length,1);
  const s=(await rows(null,'select jp_interview_summary($1) as s',[company]))[0].s;assert.deepEqual([s.count,s.positive,s.offers],[1,100,100]);
 });
 await t.test('salaries appear only as aggregates of three or more',async()=>{
  await assert.rejects(()=>rows(seeker,'select jp_report_salary($1)',[{companyId:company,jobTitle:'Registered Nurse',pay:5,period:'year'}]),/realistic pay/);
  await rows(seeker,'select jp_report_salary($1)',[{companyId:company,jobTitle:'Registered Nurse',pay:95000,period:'year'}]);
  await rows(other,'select jp_report_salary($1)',[{companyId:company,jobTitle:'registered  nurse',pay:99000,period:'year'}]);
  assert.equal((await rows(null,'select * from jp_company_reported_salaries($1)',[company])).length,0);
  await assert.rejects(()=>rows(null,'select pay from salary_reports'),/permission denied/);
  const extra=uid(40);await admin("insert into auth.users(id,email) values($1,'x@example.test')",[extra]);
  await rows(extra,'select jp_report_salary($1)',[{companyId:company,jobTitle:'Registered Nurse',pay:101000,period:'year'}]);
  await rows(seeker,'select jp_report_salary($1)',[{companyId:company,jobTitle:'Registered Nurse',pay:97000,period:'year'}]);
  const [agg]=await rows(null,'select * from jp_company_reported_salaries($1)',[company]);
  assert.deepEqual([Number(agg.reports),Number(agg.low),Number(agg.median),Number(agg.high)],[3,97000,99000,101000]);
  const look=(await rows(null,"select jp_salary_lookup('registered nurse',null) as l"))[0].l;
  assert.equal(look.reported[0].n,3);assert.ok(look.advertised.length>=1);
 });
 await t.test('questions are moderated; employer answers publish at once',async()=>{
  const {id}=(await rows(seeker,'select jp_ask_question($1,$2) as r',[company,'What are the rosters like for new graduates?']))[0].r;
  await assert.rejects(()=>rows(owner,'select jp_answer_question($1,$2)',[id,'Rosters are set four weeks ahead.']),/not available/);
  await rows(adminId,"select jp_moderate_community('question',$1,'publish','Meets guidelines')",[id]);
  assert.equal((await rows(recruiter,'select jp_answer_question($1,$2) as r',[id,'Rosters are set four weeks ahead with a mix of shifts.']))[0].r.status,'published');
  assert.equal((await rows(other,'select jp_answer_question($1,$2) as r',[id,'In my ward we had mostly day shifts at first.']))[0].r.status,'pending');
  await assert.rejects(()=>rows(seeker,'select jp_answer_question($1,$2)',[id,'Answering my own question here.']),/own question/);
  const answers=await rows(null,'select body,from_employer from company_answers');assert.deepEqual(answers.map(a=>a.from_employer),[true]);
 });
});
