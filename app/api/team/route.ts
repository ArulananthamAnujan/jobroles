import {z} from 'zod';
import {authenticatedClient,jsonBody,sameOrigin,response,failure,ApiError} from '@/lib/backend/server';
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('invite'),companyId:id,email:z.string().email().max(254),role:z.enum(['recruiter','hiring_manager'])}),z.object({action:z.literal('accept'),token:z.string().regex(/^[0-9a-f]{64}$/)}),z.object({action:z.literal('assign'),jobId:id,userId:id,assigned:z.boolean()})]);
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the team form fields.');
 const {action,...fields}=parsed.data;let token:string|undefined;let payload:Record<string,unknown>=fields;
 if(action==='invite')token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
 if(parsed.data.action==='accept')token=parsed.data.token;
 if(token){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');payload={...fields,hash};delete payload.token;}
 const {data,error}=await client.rpc('jp_team_command',{action,payload});if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Team action could not be saved.');
 return response({result:data,...(action==='invite'?{invitationUrl:`${process.env.APP_ORIGIN}/account/invite#${token}`}:{})});
}catch(error){return failure(error);}}
