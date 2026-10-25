import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
// One endpoint for the employer portal. Every read and write goes through a database function that checks the
// caller's company role, so this route only validates shapes and maps errors.
const id=z.string().uuid();
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Client=Awaited<ReturnType<typeof authenticatedClient>>['client'];
function denied(error:{code?:string;message:string}|null,fallback:string):never{
 throw new ApiError(error?.code==='42501'?403:400,error&&['42501','22023'].includes(error.code||'')?error.message:fallback);
}
async function read(client:Client,userId:string,resource:string,p:URLSearchParams){
 const company=p.get('company')||'',job=p.get('job')||'';
 const need=(v:string)=>{if(!UUID.test(v))throw new ApiError(400,'Choose a company or job.');return v;};
 switch(resource){
  case 'dashboard':{const {data,error}=await client.rpc('jp_employer_dashboard',{company:need(company)});if(error)denied(error,'Dashboard unavailable.');return data;}
  case 'jobs':{
   const {data,error}=await client.from('jobs').select('id,company_id,title,state,published_at,expires_at,created_at,description,employment_type,arrangement,salary_min,salary_max,salary_period,visa_sponsorship,benefits,start_date,external_apply_url,assessment_code,job_locations(label),screening_questions(id,question,required,position)').eq('company_id',need(company)).order('created_at',{ascending:false}).limit(500);
   if(error)throw new ApiError(503,'Jobs unavailable.');
   const {data:stats}=await client.rpc('jp_job_stats',{company});
   return {jobs:(data||[]).map(j=>({...j,screening_questions:(j.screening_questions||[]).sort((a:{position:number},b:{position:number})=>a.position-b.position)})),stats:stats||[]};
  }
  case 'rules':{const {data,error}=await client.rpc('jp_screening_rules',{target:need(job)});if(error)denied(error,'Questions unavailable.');return {rules:data};}
  case 'pipeline':{
   const {data,error}=await client.rpc('jp_pipeline',{target:need(job)});if(error)denied(error,'Applicants unavailable.');
   const [{data:questions},{data:rules}]=await Promise.all([client.from('screening_questions').select('id,question,position').eq('job_id',job).order('position'),client.rpc('jp_screening_rules',{target:job})]);
   return {applicants:data,questions:(questions||[]).map(q=>({...q,...(((rules||[]) as {id:string;must_have:boolean;expected_answer:string}[]).find(r=>r.id===q.id)||{})}))};
  }
  case 'inbox':{const {data,error}=await client.rpc('jp_inbox',{company:need(company)});if(error)denied(error,'Inbox unavailable.');return {threads:data};}
  case 'calendar':{const from=p.get('from')||new Date().toISOString(),to=p.get('to')||new Date(Date.now()+42*864e5).toISOString();const {data,error}=await client.rpc('jp_interview_calendar',{company:need(company),from_at:from,to_at:to});if(error)denied(error,'Calendar unavailable.');return {interviews:data};}
  case 'team':{const {data,error}=await client.rpc('jp_team',{company:need(company)});if(error)denied(error,'Team unavailable.');return data;}
  case 'templates':{const {data,error}=await client.from('message_templates').select('id,name,body,created_at').eq('company_id',need(company)).order('name');if(error)throw new ApiError(503,'Templates unavailable.');return {templates:data};}
  case 'billing':{const {data,error}=await client.from('job_sponsorships').select('id,job_id,amount_total,currency,starts_at,ends_at,created_at,invoice_url,jobs(title)').eq('company_id',need(company)).order('created_at',{ascending:false}).limit(200);if(error)throw new ApiError(503,'Billing unavailable.');return {orders:data};}
  case 'prefs':{const {data}=await client.from('notification_prefs').select('new_applicant,messages,stage_changes,daily_digest').eq('user_id',userId).maybeSingle();return {prefs:data||{new_applicant:true,messages:true,stage_changes:true,daily_digest:false}};}
  case 'overview':{const {data,error}=await client.rpc('jp_hiring_overview',{company:need(company)});if(error)denied(error,'Overview unavailable.');return data;}
  case 'events':{const {data,error}=await client.rpc('jp_company_events',{company:need(company)});if(error)denied(error,'Events unavailable.');return {events:data};}
  case 'candidate':{const {data,error}=await client.rpc('jp_candidate_extras',{target:need(p.get('application')||'')});if(error)denied(error,'Applicant unavailable.');return {extras:data};}
  case 'assessments':{const {data}=await client.from('assessments').select('code,title').order('sort');return {assessments:data||[]};}
  case 'advertising':{const {data,error}=await client.rpc('jp_ad_account',{company:need(company)});if(error)denied(error,'Advertising unavailable.');return data;}
  case 'company':{const {data,error}=await client.from('companies').select('id,name,about,abn,verified_at,logo_url,cover_url,website,industry,size_band,headquarters,founded_year,pitch,benefits,photos').eq('id',need(company)).maybeSingle();if(error||!data)throw new ApiError(404,'Company unavailable.');return {company:data};}
 }
 throw new ApiError(400,'Unknown resource.');
}
export async function GET(request:Request){try{
 const {client,user}=await authenticatedClient();rateLimit(`employer:${user.id}`,240,60_000);
 const p=new URL(request.url).searchParams;return response(await read(client,user.id,p.get('resource')||'',p));
}catch(e){return failure(e);}}
const write=z.discriminatedUnion('action',[
 z.object({action:z.literal('profile'),companyId:id,profile:z.object({about:z.string().max(5000).optional(),logoUrl:z.string().max(500).optional(),coverUrl:z.string().max(500).optional(),website:z.string().max(300).optional(),industry:z.string().max(80).optional(),sizeBand:z.string().max(20).optional(),headquarters:z.string().max(120).optional(),foundedYear:z.string().max(4).optional(),pitch:z.string().max(2000).optional(),benefits:z.array(z.string().max(80)).max(20).optional(),photos:z.array(z.string().max(500)).max(12).optional()})}),
 z.object({action:z.literal('screening'),jobId:id,questions:z.array(z.object({question:z.string().trim().min(5).max(300),mustHave:z.boolean(),expected:z.enum(['Yes','No'])})).min(1).max(10)}),
 z.object({action:z.literal('extras'),jobId:id,benefits:z.array(z.string().max(80)).max(20),startDate:z.string().max(10),externalApplyUrl:z.string().max(500)}),
 z.object({action:z.literal('bulk'),ids:z.array(id).min(1).max(200),stage:z.enum(['new','reviewed','shortlisted','interview','offer','hired','rejected']),message:z.string().max(5000).optional()}),
 z.object({action:z.literal('template.save'),companyId:id,name:z.string().trim().min(2).max(80),body:z.string().trim().min(10).max(5000)}),
 z.object({action:z.literal('template.delete'),id}),
 z.object({action:z.literal('propose'),applicationId:id,slots:z.array(z.string().datetime({offset:true})).min(1).max(5),timeZone:z.string().min(1).max(100),format:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal('prefs'),newApplicant:z.boolean(),messages:z.boolean(),stageChanges:z.boolean(),dailyDigest:z.boolean()}),
 z.object({action:z.literal('invite.revoke'),id}),
 z.object({action:z.literal('read'),applicationId:id}),
 z.object({action:z.literal('import'),companyId:id,submit:z.boolean(),rows:z.array(z.object({title:z.string().max(160),description:z.string().max(20000),locations:z.array(z.string().max(160)).max(10),type:z.string().max(40),arrangement:z.string().max(40),min:z.number().nullable(),max:z.number().nullable(),period:z.string().max(10),sponsorship:z.boolean().optional(),benefits:z.array(z.string().max(80)).max(20).optional(),startDate:z.string().max(10).optional(),externalApplyUrl:z.string().max(500).optional(),screening:z.string().max(300).optional()})).min(1).max(200)}),
 z.object({action:z.literal('event.save'),event:z.object({id:id.optional(),companyId:id,title:z.string().trim().min(5).max(140),description:z.string().trim().min(20).max(5000),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),timeZone:z.string().max(60),mode:z.enum(['online','in_person']),location:z.string().max(200).optional(),joinUrl:z.string().max(500).optional(),capacity:z.number().int().min(1).max(10000).nullable().optional()})}),
 z.object({action:z.literal('event.cancel'),id}),
 z.object({action:z.literal('job.assessment'),jobId:id,code:z.string().regex(/^[a-z-]{3,40}$/).nullable()}),
 z.object({action:z.literal('campaign'),jobId:id,dailyBudget:z.number().int().min(500).max(100000),cpc:z.number().int().min(50).max(2000),active:z.boolean()}),
]);
export async function POST(request:Request){try{
 sameOrigin(request);const {client,user}=await authenticatedClient();rateLimit(`employer-write:${user.id}`,120,60_000);
 const parsed=write.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the form fields and try again.');
 const d=parsed.data;
 const {data,error}=d.action==='profile'?await client.rpc('jp_company_profile',{company:d.companyId,payload:d.profile})
  :d.action==='screening'?await client.rpc('jp_set_screening',{target:d.jobId,questions:d.questions})
  :d.action==='extras'?await client.rpc('jp_job_extras',{target:d.jobId,payload:{benefits:d.benefits,startDate:d.startDate,externalApplyUrl:d.externalApplyUrl}})
  :d.action==='bulk'?await client.rpc('jp_bulk_move',{ids:d.ids,wanted:d.stage,note:d.message||null})
  :d.action==='template.save'?await client.rpc('jp_template',{action:'save',payload:{companyId:d.companyId,name:d.name,body:d.body}})
  :d.action==='template.delete'?await client.rpc('jp_template',{action:'delete',payload:{id:d.id}})
  :d.action==='propose'?await client.rpc('jp_propose_interview',{target:d.applicationId,options:d.slots,zone:d.timeZone,details:d.format})
  :d.action==='prefs'?await client.rpc('jp_set_notification_prefs',{payload:{newApplicant:d.newApplicant,messages:d.messages,stageChanges:d.stageChanges,dailyDigest:d.dailyDigest}})
  :d.action==='invite.revoke'?await client.rpc('jp_revoke_invitation',{target:d.id})
  :d.action==='import'?await client.rpc('jp_bulk_import_jobs',{company:d.companyId,rows:d.rows,submit:d.submit})
  :d.action==='event.save'?await client.rpc('jp_save_event',{payload:d.event})
  :d.action==='event.cancel'?await client.rpc('jp_cancel_event',{target:d.id})
  :d.action==='job.assessment'?await client.rpc('jp_set_job_assessment',{target:d.jobId,assessment:d.code})
  :d.action==='campaign'?await client.rpc('jp_set_campaign',{target:d.jobId,daily_budget:d.dailyBudget,cpc:d.cpc,turn_on:d.active})
  :await client.rpc('jp_mark_read',{target:d.applicationId});
 if(error)denied(error,'The change could not be saved.');
 return response({result:data});
}catch(e){return failure(e);}}
