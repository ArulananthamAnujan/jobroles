import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
type Client=Awaited<ReturnType<typeof authenticatedClient>>['client'];
// Postgres and PostgREST codes for "this function does not exist yet", i.e. the database is missing a migration.
const MISSING=new Set(['PGRST202','42883']);
// Everything the job seeker's home screen shows, in one call.
export async function GET(){try{
 const {client,user}=await authenticatedClient();const {data,error}=await client.rpc('jp_seeker_home');
 if(!error)return response({...data,email:user.email});
 // The real reason goes to the server log, so it can be found in the hosting function logs.
 console.error('seeker-home: jp_seeker_home failed',{code:error.code,message:error.message,hint:error.hint});
 if(MISSING.has(error.code||''))return response({...await basicHome(client,user.id),email:user.email,partial:true});
 throw new ApiError(503,'Your home screen could not be loaded. Please try again in a minute.');
}catch(e){return failure(e);}}

// A plainer home built from tables every deployment has, used until migration 20261027000001 is applied. It has
// each application's stage, but not unread messages, interview times or the employer's reply rate.
async function basicHome(client:Client,uid:string){
 const head={count:'exact' as const,head:true};
 const [apps,profile,resumes,drafts,saved,alerts]=await Promise.all([
  client.from('applications').select('id,job_id,state,stage,submitted_at,jobs(title,companies(id,name))').eq('seeker_id',uid).neq('state','draft').order('submitted_at',{ascending:false}).limit(100),
  client.from('seeker_profiles').select('full_name,headline,location,skills,searchable').eq('user_id',uid).maybeSingle(),
  client.from('resume_versions').select('id',head).eq('user_id',uid).is('deleted_at',null),
  client.from('applications').select('id',head).eq('seeker_id',uid).eq('state','draft'),
  client.from('saved_jobs').select('job_id',head).eq('user_id',uid),
  client.from('saved_searches').select('id',head).eq('user_id',uid).neq('frequency','off')]);
 type Row={id:string;job_id:string;state:string;stage:string;submitted_at:string;jobs:null|{title:string;companies:null|{id:string;name:string}}};
 const p=profile.data as null|{full_name:string;headline:string;location:string;skills:string[];searchable:boolean};
 return {
  applications:((apps.data||[]) as unknown as Row[]).map(a=>({id:a.id,jobId:a.job_id,title:a.jobs?.title||'Application',company:a.jobs?.companies?.name||'',companyId:a.jobs?.companies?.id||'',
   state:a.state,stage:a.stage,submittedAt:a.submitted_at,updatedAt:a.submitted_at,unread:0,interview:null,proposal:false,responseShare:null,unknown:true})),
  drafts:drafts.count||0,saved:saved.count||0,alerts:alerts.count||0,invites:0,
  profile:p&&{name:p.full_name,headline:Boolean(p.headline),location:Boolean(p.location),skills:(p.skills||[]).length>0,experience:false,searchable:p.searchable,resume:(resumes.count||0)>0,assessment:false}};
}
