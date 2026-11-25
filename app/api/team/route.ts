import {z} from 'zod';
import {authenticatedClient,accountClient,jsonBody,sameOrigin,response,failure,ApiError} from '@/lib/backend/server';
import {rateLimit,clientIp} from '@/lib/backend/guard';
import {appOrigin} from '@/lib/backend/guard';
const sha=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[z.object({action:z.literal('invite'),companyId:id,email:z.string().email().max(254),role:z.enum(['recruiter','hiring_manager'])}),z.object({action:z.literal('accept'),token:z.string().regex(/^[0-9a-f]{64}$/)}),z.object({action:z.literal('assign'),jobId:id,userId:id,assigned:z.boolean()})]);
export async function POST(request:Request){try{
 sameOrigin(request);const raw=await jsonBody(request);
 // What an invitation link is for, shown before the person signs in. Only the holder of the link can ask.
 if((raw as {action?:string})?.action==='preview'){
  const token=(raw as {token?:unknown}).token;if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw new ApiError(400,'This invitation link is incomplete.');
  rateLimit(`invite-preview:${clientIp(request)}`,30,60_000);
  const {data,error}=await (await accountClient()).rpc('jp_invitation_preview',{hash:await sha(token)});
  // On a database without the newest update the page still works: it just cannot say who the invitation is from.
  return response({invitation:error?{state:'open'}:data});
 }
 const {client}=await authenticatedClient();const parsed=schema.safeParse(raw);if(!parsed.success)throw new ApiError(400,'Check the team form fields.');
 const {action,...fields}=parsed.data;let token:string|undefined;let payload:Record<string,unknown>=fields;
 if(parsed.data.action==='invite'){
  // Someone already on the team does not need an invitation; say so instead of emailing them one.
  const wanted=parsed.data.email.trim().toLowerCase(),team=await client.rpc('jp_team',{company:parsed.data.companyId});
  if(!team.error&&((team.data as {members?:{email:string}[]})?.members||[]).some(m=>m.email?.toLowerCase()===wanted))throw new ApiError(400,`${parsed.data.email.trim()} is already on your team.`);
 }
 if(action==='invite')token=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
 if(parsed.data.action==='accept')token=parsed.data.token;
 if(token){payload={...fields,hash:await sha(token)};delete payload.token;}
 const {data,error}=await client.rpc('jp_team_command',{action,payload});if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Team action could not be saved.');
 if(action!=='invite')return response({result:data});
 // Email the invitation. If that is not possible (older database, daily limit) the owner still gets the link to share.
 const queued=await client.rpc('jp_queue_invitation_mail',{invitation:(data as {id:string}).id,secret:token});
 return response({result:data,invitationUrl:`${appOrigin()}/account/invite#${token}`,emailed:!queued.error,...(queued.error?.code==='22023'?{emailProblem:queued.error.message}:{})});
}catch(error){return failure(error);}}
