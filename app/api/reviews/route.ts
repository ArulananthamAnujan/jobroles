import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('submit'),companyId:id,rating:z.number().int().min(1).max(5),communication:z.number().int().min(1).max(5).optional(),fairness:z.number().int().min(1).max(5).optional(),speed:z.number().int().min(1).max(5).optional(),title:z.string().trim().min(3).max(120),pros:z.string().trim().min(10).max(2000),cons:z.string().trim().min(10).max(2000)}),
 z.object({action:z.literal('moderate'),id,decision:z.enum(['publish','reject']),reason:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal('respond'),id,reply:z.string().trim().min(10).max(2000)}),
 z.object({action:z.literal('helpful'),id}),
]);
// Owners see published reviews of their companies; administrators also get the moderation queue.
export async function GET(request:Request){try{
 const {client}=await authenticatedClient();const company=new URL(request.url).searchParams.get('company');
 const [{data:isAdmin},published]=await Promise.all([client.rpc('jp_is_admin'),company&&/^[0-9a-f-]{36}$/i.test(company)?client.from('company_reviews').select('id,company_id,rating,title,pros,cons,employer_response,published_at').eq('company_id',company).eq('status','published').order('published_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null})]);
 const pending=isAdmin?await client.rpc('jp_pending_reviews'):{data:[]};
 return response({published:published.data||[],pending:pending.data||[]});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client,user}=await authenticatedClient();rateLimit(`reviews:${user.id}`,20,60*60_000);
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Give 1 to 5 stars, a title, and at least 10 characters for each part.');
 const d=parsed.data;
 const {data,error}=d.action==='submit'?await client.rpc('jp_submit_review',{company:d.companyId,stars:d.rating,headline:d.title,good:d.pros,bad:d.cons,communication:d.communication??null,fairness:d.fairness??null,speed:d.speed??null})
  :d.action==='moderate'?await client.rpc('jp_moderate_review',{target:d.id,decision:d.decision,reason:d.reason})
  :d.action==='helpful'?await client.rpc('jp_mark_helpful',{target:d.id})
  :await client.rpc('jp_respond_review',{target:d.id,reply:d.reply});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'The review could not be saved.');
 return response({result:data});
}catch(e){return failure(e);}}
