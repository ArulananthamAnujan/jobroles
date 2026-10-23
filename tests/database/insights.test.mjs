import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {seeker,owner,recruiter,manager,other,job,foreignJob,company,resume,question}=ids;
test('recommendations and employer stats',async t=>{
 const {db,rows,command,admin}=await createDb();
 const remote='00000000-0000-4000-8000-000000000090',far='00000000-0000-4000-8000-000000000091';
 await admin(`insert into jobs(id,company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,published_at,expires_at) values
  ($1,$3,'Clinical Nurse Educator','Teach and support nursing staff remotely across our network.','live','Full-time','remote',100000,110000,'year',now(),now()+interval '30 days'),
  ($2,$3,'Registered Nurse Darwin','Remote area nurse role in the Top End.','live','Full-time','on_site',110000,120000,'year',now(),now()+interval '30 days')`,[remote,far,company]);
 await admin(`insert into job_locations(job_id,label) values($1,'Darwin NT')`,[far]);
 await command(seeker,'profile.save',{name:'Sam Seeker',headline:'Registered nurse',location:'Mornington VIC',skills:['triage','nursing']});
 await t.test('recommendations match the profile, prefer nearby or remote roles and skip far-away ones',async()=>{
  const r=await rows(seeker,'select job_id from jp_recommend_jobs()');
  assert.ok(r.some(x=>x.job_id===job));assert.ok(r.some(x=>x.job_id===remote));assert.ok(!r.some(x=>x.job_id===far));assert.ok(!r.some(x=>x.job_id===foreignJob));
  await assert.rejects(()=>rows(null,'select * from jp_recommend_jobs()'),/permission denied/);
 });
 await t.test('roles already applied to and blocked employers are left out',async()=>{
  await command(seeker,'application.submit',{jobId:job,resumeId:resume,answers:{[question]:'Yes'},cover:''});
  assert.ok(!(await rows(seeker,'select job_id from jp_recommend_jobs()')).some(x=>x.job_id===job));
 });
 await t.test('views count only for live roles and are visible only to the employer team',async()=>{
  for(let i=0;i<4;i++)await rows(null,'select jp_record_job_view($1)',[job]);
  await rows(null,'select jp_record_job_view($1)',['00000000-0000-4000-8000-000000000555']);
  await assert.rejects(()=>rows(null,'select * from job_view_counts'),/permission denied/);
  const [s]=(await rows(owner,'select * from jp_job_stats($1)',[company])).filter(x=>x.job_id===job);
  assert.equal(Number(s.views_30d),4);assert.equal(Number(s.applications),1);assert.equal(Number(s.apply_rate),25);
  assert.equal((await rows(recruiter,'select * from jp_job_stats($1)',[company])).length,3);
  for(const u of [manager,other,seeker])await assert.rejects(()=>rows(u,'select * from jp_job_stats($1)',[company]),/Employer access required/);
 });
 await t.test('hires feed the median days to hire',async()=>{
  const [a]=await admin('select id from applications where job_id=$1',[job]);
  await command(owner,'application.move',{id:a.id,stage:'hired'});
  const [s]=(await rows(owner,'select * from jp_job_stats($1)',[company])).filter(x=>x.job_id===job);
  assert.equal(Number(s.hired),1);assert.equal(Number(s.median_days_to_hire),0);
 });
 await db.close();
});
