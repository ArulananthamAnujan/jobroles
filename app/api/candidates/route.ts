import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {client,user}=await authenticatedClient();rateLimit(`candidates:${user.id}`,60,60_000);
 const p=new URL(request.url).searchParams,company=p.get('company')||'';if(!UUID.test(company))throw new ApiError(400,'Choose a company.');
 const page=Math.max(0,Math.min(50,Math.floor(Number(p.get('page'))||0)));
 const radius=[10,25,50,100,250].includes(Number(p.get('radius')))?Number(p.get('radius')):50;
 const {data,error}=await client.rpc('jp_search_candidates',{company,p_query:(p.get('q')||'').slice(0,200)||null,p_near:(p.get('near')||'').slice(0,120)||null,p_radius_km:radius,p_offset:page*20});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Candidate search is unavailable.');
 const rows=(data||[]) as {total_count:number}[];
 return response({candidates:rows,total:rows[0]?Number(rows[0].total_count):0,page});
}catch(e){return failure(e);}}
const invite=z.object({jobId:z.string().uuid(),seekerId:z.string().uuid(),message:z.string().trim().min(20).max(1000)});
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const parsed=invite.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Choose a role and write a message of 20 to 1000 characters.');
 const {data,error}=await client.rpc('jp_invite_candidate',{target_job:parsed.data.jobId,seeker:parsed.data.seekerId,note:parsed.data.message});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'The invitation could not be sent.');
 return response({result:data});
}catch(e){return failure(e);}}
