import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,other,owner,manager,recruiter,company,job,resume,question}=ids;
test('career tools',async t=>{
 const {rows,command,admin}=await createDb();
 await t.test('the career profile validates and saves the resume sections',async()=>{
  await assert.rejects(()=>rows(seeker,'select jp_save_career_profile($1)',[{experience:[{title:'Nurse',company:'Bayside',start:'2026-13'}]}]),/start month/);
  await rows(seeker,'select jp_save_career_profile($1)',[{summary:'Emergency nurse with six years in busy departments.',experience:[{title:'Registered Nurse',company:'Monash Health',location:'Clayton VIC',start:'2020-02',end:null,description:'Triage and resuscitation.'}],
   education:[{qualification:'Bachelor of Nursing',institution:'Deakin University',year:'2019'}],licences:['AHPRA registration','Working with Children Check',''],languages:['English','Tamil'],desiredTitles:['Emergency nurse'],desiredPay:105000,desiredPeriod:'year',desiredTypes:['Full-time','Bogus'],readyToWork:true,availability:'Two weeks notice'}]);
  const [p]=await rows(seeker,'select summary,experience,education,licences,desired_types,ready_to_work from seeker_profiles where user_id=$1',[seeker]);
  assert.equal(p.experience[0].company,'Monash Health');assert.equal(p.education[0].year,2019);assert.deepEqual(p.licences,['AHPRA registration','Working with Children Check']);assert.deepEqual(p.desired_types,['Full-time']);assert.equal(p.ready_to_work,true);
 });
 await t.test('assessments are scored in the database, once a month',async()=>{
  const start=(await rows(seeker,"select jp_start_assessment('workplace-numeracy') as s"))[0].s;
  assert.equal(start.questions.length,8);assert.equal(Object.hasOwn(start.questions[0],'answer'),false);
  await assert.rejects(()=>rows(seeker,'select * from private.assessment_questions'),/permission denied/);
  await assert.rejects(()=>rows(other,'select jp_finish_assessment($1,$2)',[start.attempt,{}]),/not found/);
  const keys=await admin("select position,answer from private.assessment_questions where code='workplace-numeracy' order by position");
  const answers=Object.fromEntries(keys.map((k,i)=>[String(k.position),i<6?k.answer:(k.answer+1)%4]));
  const r=(await rows(seeker,'select jp_finish_assessment($1,$2) as r',[start.attempt,answers]))[0].r;
  assert.deepEqual([r.score,r.level,r.correct],[75,'Highly proficient',6]);
  await assert.rejects(()=>rows(seeker,'select jp_finish_assessment($1,$2)',[start.attempt,answers]),/already finished/);
  await assert.rejects(()=>rows(seeker,"select jp_start_assessment('workplace-numeracy')"),/30 days/);
  const late=(await rows(seeker,"select jp_start_assessment('spreadsheets') as s"))[0].s;
  await admin("update assessment_attempts set started_at=now()-interval '1 hour' where id=$1",[late.attempt]);
  await assert.rejects(()=>rows(seeker,'select jp_finish_assessment($1,$2)',[late.attempt,{}]),/Time ran out/);
 });
 await t.test('hiring teams see the profile and shared results of their applicants only',async()=>{
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
  const [{id:app}]=await admin('select id from applications limit 1');
  const x=(await rows(manager,'select jp_candidate_extras($1) as x',[app]))[0].x;
  assert.equal(x.experience[0].title,'Registered Nurse');assert.deepEqual(x.assessments.map(a=>[a.title,a.level]),[['Workplace numeracy','Highly proficient']]);
  await assert.rejects(()=>rows(other,'select jp_candidate_extras($1)',[app]),/unavailable/);
  const [{id:attempt}]=await rows(seeker,"select id from assessment_attempts where completed_at is not null");
  await rows(seeker,'select jp_share_assessment($1,false)',[attempt]);
  assert.equal((await rows(owner,'select jp_candidate_extras($1) as x',[app]))[0].x.assessments.length,0);
  await assert.rejects(()=>rows(manager,"select jp_set_job_assessment($1,'customer-service')",[job]),/Employer access/);
  await rows(recruiter,"select jp_set_job_assessment($1,'customer-service')",[job]);
  assert.equal((await rows(null,'select assessment_code from jobs where id=$1',[job]))[0].assessment_code,'customer-service');
 });
 await t.test('hiring events take registrations up to capacity and keep the link private',async()=>{
  const base={companyId:company,title:'Nursing open day',description:'Meet our emergency and aged care teams and get interviewed on the day.',mode:'online',joinUrl:'https://meet.example/abc',capacity:1,timeZone:'Australia/Melbourne'};
  const when={startsAt:new Date(Date.now()+864e5).toISOString(),endsAt:new Date(Date.now()+864e5+2*36e5).toISOString()};
  await assert.rejects(()=>rows(manager,'select jp_save_event($1)',[{...base,...when}]),/Owners and recruiters/);
  await assert.rejects(()=>rows(owner,'select jp_save_event($1)',[{...base,...when,mode:'in_person'}]),/location/);
  const {id}=(await rows(owner,'select jp_save_event($1) as r',[{...base,...when}]))[0].r;
  await assert.rejects(()=>rows(null,'select join_url from hiring_events'),/permission denied/);
  assert.equal((await rows(null,'select title from hiring_events'))[0].title,'Nursing open day');
  assert.equal((await rows(seeker,'select jp_register_event($1,true) as r',[id]))[0].r.joinUrl,'https://meet.example/abc');
  await assert.rejects(()=>rows(other,'select jp_register_event($1,true)',[id]),/full/);
  const ev=(await rows(owner,'select jp_company_events($1) as e',[company]))[0].e[0];assert.deepEqual([ev.registered,ev.attendees[0].name],[1,'Sam Seeker']);
  await rows(seeker,'select jp_register_event($1,false)',[id]);
  await rows(other,'select jp_register_event($1,true)',[id]);
  assert.equal((await rows(other,'select jp_my_event($1) as m',[id]))[0].m.registered,true);
  await rows(owner,'select jp_cancel_event($1)',[id]);
  await assert.rejects(()=>rows(seeker,'select jp_register_event($1,true)',[id]),/not taking/);
 });
 await t.test('seekers can hide jobs they are not interested in',async()=>{
  await rows(seeker,'select jp_hide_job($1,true)',[job]);
  assert.equal((await rows(seeker,'select job_id from hidden_jobs')).length,1);
  assert.equal((await rows(other,'select job_id from hidden_jobs')).length,0);
  await rows(seeker,'select jp_hide_job($1,false)',[job]);
  assert.equal((await rows(seeker,'select job_id from hidden_jobs')).length,0);
 });
});
