import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
import {iceServers} from '@/lib/ice';
export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const peer=z.string().regex(/^[a-z0-9-]{8,64}$/);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('signal'),peer,kind:z.enum(['hello','offer','answer','candidate','bye']),payload:z.record(z.string(),z.unknown()).default({})}),
 z.object({action:z.literal('poll'),peer,after:z.number().int().min(0)}),
]);
const fail=(error:{code?:string;message:string})=>new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code||'')?error.message:'The call could not connect.');
// Waiting-room details for the applicant or hiring team.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!UUID.test(id))throw new ApiError(404,'Interview unavailable.');
 const {client}=await authenticatedClient();const {data,error}=await client.rpc('jp_video_room',{target:id});if(error)throw fail(error);
 return response({room:data,iceServers:await iceServers()});
}catch(e){return failure(e);}}
// Relays WebRTC setup messages; media goes directly between the browsers.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 sameOrigin(request);const {id}=await params;if(!UUID.test(id))throw new ApiError(404,'Interview unavailable.');
 const {client,user}=await authenticatedClient();rateLimit(`video:${user.id}`,600,60_000);
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Invalid call message.');
 const d=parsed.data;
 if(d.action==='signal'){const {data,error}=await client.rpc('jp_video_signal',{target:id,peer_id:d.peer,signal_kind:d.kind,body:d.payload});if(error)throw fail(error);return response({id:data});}
 const {data,error}=await client.rpc('jp_video_poll',{target:id,peer_id:d.peer,after_id:d.after});if(error)throw fail(error);
 return response({signals:data||[]});
}catch(e){return failure(e);}}
