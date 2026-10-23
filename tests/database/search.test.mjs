import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,ids} from './harness.mjs';
const {company,job,foreignJob,seeker}=ids;
const search=(rows,user,args={})=>rows(user,`select * from jp_search_jobs(p_query=>$1,p_location=>$2,p_company=>$3,p_arrangement=>$4,p_type=>$5,p_salary_min=>$6,p_salary_max=>$7,p_period=>coalesce($8,'year'),p_posted_days=>$9,p_near=>$10,p_radius_km=>$11,p_sort=>coalesce($12,'relevance'),p_limit=>coalesce($13,20),p_offset=>coalesce($14,0))`,
 [args.q??null,args.location??null,args.company??null,args.arrangement??null,args.type??null,args.min??null,args.max??null,args.period??null,args.posted??null,args.near??null,args.radius??null,args.sort??null,args.limit??null,args.offset??null]);
test('ranked job search',async t=>{
 const {db,rows,admin}=await createDb();
 const extra='00000000-0000-4000-8000-000000000099',hidden='00000000-0000-4000-8000-000000000098',old='00000000-0000-4000-8000-000000000097';
 await admin(`insert into jobs(id,company_id,title,description,state,employment_type,arrangement,salary_min,salary_max,salary_period,published_at,expires_at) values
  ($1,$2,'Warehouse Team Leader','Lead a forklift crew in a busy distribution centre near Geelong.','live','Casual','on_site',35,40,'hour',now(),now()+interval '30 days'),
  ($3,$2,'Registered Nurse Draft','Not yet published nurse role with a nurse team.','draft','Full-time','on_site',90000,100000,'year',null,null),
  ($4,$2,'Senior Software Engineer','Nurse rostering software for hospitals, written in TypeScript.','live','Full-time','remote',150000,170000,'year',now()-interval '20 days',now()+interval '10 days')`,[extra,company,hidden,old]);
 await admin(`insert into job_locations(job_id,label) values($1,'Geelong VIC'),($2,'Remote, Australia')`,[extra,old]);
 await t.test('locations are geocoded from the gazetteer',async()=>{
  const r=await rows(null,'select label,latitude is not null as placed from job_locations order by label');
  assert.deepEqual(r.map(x=>[x.label,x.placed]),[['Frankston VIC',true],['Geelong VIC',true],['Remote, Australia',false],['Sydney NSW',true]]);
 });
 await t.test('title matches outrank description matches and drafts never appear',async()=>{
  const r=await search(rows,null,{q:'nurse'});
  assert.deepEqual(r.map(x=>x.job_id).slice(0,2).sort(),[job,foreignJob].sort());
  assert.equal(r.at(-1).job_id,old);assert.ok(!r.some(x=>x.job_id===hidden));assert.equal(Number(r[0].total_count),3);
 });
 await t.test('websearch syntax supports OR and quoted phrases',async()=>{
  assert.deepEqual((await search(rows,null,{q:'forklift OR "software engineer"'})).map(x=>x.job_id).sort(),[extra,old].sort());
 });
 await t.test('company names are searchable',async()=>{assert.deepEqual((await search(rows,null,{q:'Bayside'})).map(x=>x.job_id).sort(),[job,extra,old].sort());});
 await t.test('distance search uses the nearest location and the radius',async()=>{
  const near=await search(rows,null,{near:'Frankston VIC',radius:25});
  assert.deepEqual(near.map(x=>x.job_id),[job]);assert.ok(near[0].distance_km<1);
  const wide=await search(rows,null,{near:'Melbourne',radius:100,sort:'distance'});
  assert.deepEqual(wide.map(x=>x.job_id),[job,extra]);
  await assert.rejects(()=>search(rows,null,{near:'Atlantis'}),/do not recognise/);
 });
 await t.test('posted-within, salary and type filters combine',async()=>{
  assert.ok(!(await search(rows,null,{posted:7})).some(x=>x.job_id===old));
  assert.deepEqual((await search(rows,null,{min:140000})).map(x=>x.job_id),[old]);
  assert.deepEqual((await search(rows,null,{period:'hour',min:30})).map(x=>x.job_id),[extra]);
  assert.deepEqual((await search(rows,null,{type:'Casual'})).map(x=>x.job_id),[extra]);
 });
 await t.test('literal wildcards in text filters do not match everything',async()=>{assert.equal((await search(rows,null,{location:'%'})).length,0);assert.equal((await search(rows,null,{company:'_'})).length,0);});
 await t.test('paging returns the full total on every page',async()=>{const r=await search(rows,seeker,{limit:1,offset:1});assert.equal(r.length,1);assert.equal(Number(r[0].total_count),4);});
 await t.test('application-built tsquery groups match abbreviations',async()=>{
  const r=await rows(null,"select job_id from jp_search_jobs(p_query=>$1,p_query_mode=>'tsquery')",['(rn | (registered <-> nurse))']);
  assert.deepEqual(r.map(x=>x.job_id).sort(),[job,foreignJob].sort());
 });
 await t.test('saved searches accept the new filters',async()=>{const r=await rows(seeker,"select jp_launch_command('search.save',$1::jsonb) as r",[JSON.stringify({filters:{q:'nurse',near:'Geelong',radius:'50',posted:'7',sector:'healthcare'}})]);assert.ok(r[0].r.id);});
 await db.close();
});
