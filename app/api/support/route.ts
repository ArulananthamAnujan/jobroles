import {z} from 'zod';
import {accountClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit,clientIp,verifyCaptcha} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
const schema=z.object({email:z.string().trim().email().max(254),name:z.string().trim().max(120).optional(),topic:z.enum(['account','application','job','employer','billing','privacy','report','other']),message:z.string().trim().min(20).max(5000),captcha:z.string().max(2048).optional()});
// Contact form for the help centre. Works signed in or out; signed-in requests use the account's email.
export async function POST(request:Request){try{
 sameOrigin(request);const ip=clientIp(request);rateLimit(`support:${ip}`,5,60*60_000);
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Give a valid email, choose a topic and describe the problem in at least 20 characters.');
 await verifyCaptcha(parsed.data.captcha,ip);
 const client=await accountClient();
 const {data,error}=await client.rpc('jp_submit_ticket',{contact:parsed.data.email,full_name:parsed.data.name||null,topic:parsed.data.topic,body:parsed.data.message});
 if(error)throw new ApiError(400,error.code==='22023'?error.message:'Your request could not be sent. Please try again.');
 return response({id:data},201);
}catch(e){return failure(e);}}
