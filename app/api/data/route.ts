import {authenticatedClient,response,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {client,user}=await authenticatedClient();
 // Verifies newly registered companies and publishes jobs whose one-minute wait is over. Missing on an older database: ignored.
 await client.rpc('jp_auto_approve').then(()=>{},()=>{});
 const [profile,resumes,applications,memberships,companies,jobs,admin]=await Promise.all([
  client.from('seeker_profiles').select('*').eq('user_id',user.id).maybeSingle(),
  client.from('resume_versions').select('id,filename,version,created_at').eq('user_id',user.id).is('deleted_at',null).order('version',{ascending:false}).limit(50),
  client.from('applications').select('id,job_id,state,stage,submitted_at,created_at').eq('seeker_id',user.id).order('created_at',{ascending:false}).limit(100),
  client.from('company_memberships').select('company_id,role').eq('user_id',user.id).is('revoked_at',null),
  client.from('companies').select('id,name,verified_at,sourced').limit(100),
  client.from('jobs').select('id,company_id,title,state,expires_at,description,employment_type,arrangement,salary_min,salary_max,salary_period,visa_sponsorship,external_apply_url,job_locations(label),screening_questions(id,question,required)').limit(100),
  client.rpc('jp_is_admin'),
 ]);
 if([profile,resumes,applications,memberships,companies,jobs,admin].some(x=>x.error))throw new ApiError(503,'The database schema is not ready. Please contact the platform owner.');
 const selected=new URL(request.url).searchParams.get('job');
 if(selected&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected)&&!jobs.data?.some(j=>j.id===selected)){
  const extra=await client.from('jobs').select('id,company_id,title,state,expires_at,description,employment_type,arrangement,salary_min,salary_max,salary_period,visa_sponsorship,external_apply_url,job_locations(label),screening_questions(id,question,required)').eq('id',selected).maybeSingle();
  if(extra.error)throw extra.error;if(extra.data){jobs.data?.push(extra.data);if(!companies.data?.some(c=>c.id===extra.data!.company_id)){const company=await client.from('companies').select('id,name,verified_at,sourced').eq('id',extra.data.company_id).maybeSingle();if(company.error)throw company.error;if(company.data)companies.data?.push(company.data);}}
 }
 if(selected&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(selected)&&!applications.data?.some(a=>a.job_id===selected)){
  const existing=await client.from('applications').select('id,job_id,state,stage,submitted_at,created_at').eq('seeker_id',user.id).eq('job_id',selected).maybeSingle();
  if(existing.error)throw existing.error;if(existing.data)applications.data?.push(existing.data);
 }
 // First visit after signing up as a job seeker: start the profile with the name given at sign-up, so the person is
 // greeted by name and does not have to type it again. Employers set up a company instead.
 const signupName=typeof user.user_metadata?.full_name==='string'?user.user_metadata.full_name.trim().slice(0,160):'';
 let fromEmployerSide=false;try{fromEmployerSide=/^\/(employer|admin)/.test(new URL(request.headers.get('referer')||'').pathname);}catch{}
 if(!profile.data&&signupName&&!fromEmployerSide&&!(memberships.data||[]).length){
  const made=await client.rpc('jp_command',{action:'profile.save',payload:{name:signupName,headline:'',location:'',skills:[],searchable:false}});
  if(!made.error){const again=await client.from('seeker_profiles').select('*').eq('user_id',user.id).maybeSingle();if(!again.error)profile.data=again.data;}
 }
 // The public company list is long once careers-site employers are listed, so the person's own companies are fetched by id.
 const mine=(memberships.data||[]).map(m=>m.company_id).filter(id=>!companies.data?.some(c=>c.id===id));
 if(mine.length){const own=await client.from('companies').select('id,name,verified_at,sourced').in('id',mine);if(own.error)throw new ApiError(503,'The database schema is not ready. Please contact the platform owner.');companies.data?.push(...(own.data||[]));}
 // A company handed over from job sourcing is public but has not had its ABN checked, so its team sees it as awaiting verification.
 const listed=(companies.data||[]).map(({sourced,...c})=>({...c,verified_at:sourced?null:c.verified_at}));
 return response({profile:profile.data,resumes:resumes.data,applications:applications.data,memberships:memberships.data,companies:listed,jobs:jobs.data,isAdmin:admin.data});
}catch(error){return failure(error);}}
