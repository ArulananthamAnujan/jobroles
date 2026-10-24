import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
const id=z.string().uuid(),month=z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('profile'),summary:z.string().max(2000).default(''),
  experience:z.array(z.object({title:z.string().trim().min(1).max(120),company:z.string().trim().min(1).max(160),location:z.string().max(120).optional(),start:month,end:month.nullable().optional(),description:z.string().max(2000).optional()})).max(20),
  education:z.array(z.object({qualification:z.string().trim().min(1).max(160),institution:z.string().trim().min(1).max(160),year:z.string().regex(/^((19|20)\d{2})?$/).optional()})).max(10),
  licences:z.array(z.string().max(160)).max(20),languages:z.array(z.string().max(60)).max(10),desiredTitles:z.array(z.string().max(120)).max(5),
  desiredPay:z.number().min(0).max(10000000).nullable(),desiredPeriod:z.enum(['hour','day','month','year']).nullable(),desiredTypes:z.array(z.string()).max(6),readyToWork:z.boolean(),availability:z.string().max(240).default('')}),
 z.object({action:z.literal('hide'),jobId:id,hide:z.boolean()}),
 z.object({action:z.literal('assessment.start'),code:z.string().regex(/^[a-z-]{3,40}$/)}),
 z.object({action:z.literal('assessment.finish'),attempt:id,answers:z.record(z.string().regex(/^\d{1,2}$/),z.number().int().min(0).max(9))}),
 z.object({action:z.literal('assessment.share'),attempt:id,share:z.boolean()}),
 z.object({action:z.literal('event.register'),eventId:id,attend:z.boolean()}),
]);
// The signed-in seeker's career profile, assessment results and hidden jobs.
export async function GET(){try{
 const {client,user}=await authenticatedClient();
 const [{data:profile},{data:attempts},{data:hidden},{data:prompts}]=await Promise.all([
  client.from('seeker_profiles').select('full_name,email,headline,location,skills,summary,experience,education,licences,languages,desired_titles,desired_pay,desired_period,desired_types,ready_to_work,availability').eq('user_id',user.id).maybeSingle(),
  client.from('assessment_attempts').select('id,code,started_at,completed_at,score,shared').order('started_at',{ascending:false}).limit(100),
  client.from('hidden_jobs').select('job_id').limit(1000),client.rpc('jp_review_prompts')]);
 return response({prompts:prompts||[],profile,attempts:attempts||[],hidden:(hidden||[]).map(h=>h.job_id),email:user.email});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client,user}=await authenticatedClient();rateLimit(`career:${user.id}`,120,60_000);
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the highlighted details and try again.');
 const d=parsed.data;
 const {data,error}=d.action==='profile'?await client.rpc('jp_save_career_profile',{payload:d})
  :d.action==='hide'?await client.rpc('jp_hide_job',{target:d.jobId,hide:d.hide})
  :d.action==='assessment.start'?await client.rpc('jp_start_assessment',{assessment:d.code})
  :d.action==='assessment.finish'?await client.rpc('jp_finish_assessment',{attempt:d.attempt,answers:d.answers})
  :d.action==='assessment.share'?await client.rpc('jp_share_assessment',{attempt:d.attempt,share:d.share})
  :await client.rpc('jp_register_event',{target:d.eventId,attend:d.attend});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'That could not be saved.');
 return response({result:data});
}catch(e){return failure(e);}}
