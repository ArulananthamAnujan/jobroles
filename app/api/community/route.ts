import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
const id=z.string().uuid(),stars=z.number().int().min(1).max(5);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('workplace'),companyId:id,rating:stars,title:z.string().trim().min(3).max(120),pros:z.string().trim().min(10).max(2000),cons:z.string().trim().min(10).max(2000),jobTitle:z.string().trim().min(2).max(120),status:z.enum(['current','former']),location:z.string().trim().max(120).optional(),
  worklife:stars.optional(),pay:stars.optional(),security:stars.optional(),management:stars.optional(),culture:stars.optional(),recommends:z.boolean().optional()}),
 z.object({action:z.literal('interview'),companyId:id,jobTitle:z.string().trim().min(2).max(120),experience:z.enum(['positive','neutral','negative']),difficulty:stars,outcome:z.enum(['offer_accepted','offer_declined','no_offer','waiting']),
  source:z.enum(['applied_online','recruiter','referral','other']).optional(),duration:z.enum(['days','1-2 weeks','3-4 weeks','1-2 months','longer']).optional(),process:z.string().trim().min(30).max(3000),questions:z.array(z.string().trim().min(5).max(300)).max(10),month:z.string().regex(/^\d{4}-\d{2}$/).optional()}),
 z.object({action:z.literal('salary'),companyId:id.optional(),jobTitle:z.string().trim().min(2).max(120),pay:z.number().positive().max(1000000),period:z.enum(['hour','day','month','year']),location:z.string().trim().max(120).optional(),type:z.enum(['Full-time','Part-time','Casual','Contract']).optional(),experience:z.enum(['0-1','1-3','3-5','5-10','10+']).optional()}),
 z.object({action:z.literal('question'),companyId:id,question:z.string().trim().min(10).max(300)}),
 z.object({action:z.literal('answer'),questionId:id,answer:z.string().trim().min(10).max(1500)}),
 z.object({action:z.literal('report'),kind:z.enum(['review','interview','question','answer']),id,reason:z.enum(['false','personal','offensive','spam','conflict','other']),details:z.string().trim().max(1000).optional()}),
 z.object({action:z.literal('moderate'),kind:z.enum(['interview','question','answer']),id,decision:z.enum(['publish','reject']),reason:z.string().trim().min(3).max(500)}),
]);
// Moderation queue for administrators.
export async function GET(){try{
 const {client}=await authenticatedClient();const {data,error}=await client.rpc('jp_pending_community');
 if(error)throw new ApiError(error.code==='42501'?403:503,error.code==='42501'?'Administrator required.':'Queue unavailable.');
 return response({pending:data||[]});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client,user}=await authenticatedClient();rateLimit(`community:${user.id}`,30,60*60_000);
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the form: some answers are missing or too short.');
 const {action,...d}=parsed.data;
 const call=action==='workplace'?client.rpc('jp_submit_workplace_review',{company:(d as {companyId:string}).companyId,payload:d})
  :action==='interview'?client.rpc('jp_submit_interview',{company:(d as {companyId:string}).companyId,payload:d})
  :action==='salary'?client.rpc('jp_report_salary',{payload:d})
  :action==='question'?client.rpc('jp_ask_question',{company:(d as {companyId:string}).companyId,question:(d as {question:string}).question})
  :action==='report'?client.rpc('jp_report_content',{kind:(d as {kind:string}).kind,target:(d as {id:string}).id,reason:(d as {reason:string}).reason,details:(d as {details?:string}).details||null})
  :action==='answer'?client.rpc('jp_answer_question',{target:(d as {questionId:string}).questionId,answer:(d as {answer:string}).answer})
  :client.rpc('jp_moderate_community',{kind:(d as {kind:string}).kind,target:(d as {id:string}).id,decision:(d as {decision:string}).decision,reason:(d as {reason:string}).reason});
 const {data,error}=await call;
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Could not save that.');
 return response({result:data});
}catch(e){return failure(e);}}
