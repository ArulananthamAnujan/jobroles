import {z} from 'zod';
import {authenticatedClient,response,failure,ApiError,sameOrigin,jsonBody} from '@/lib/backend/server';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),payload:z.object({kind:z.enum(['deletion','correction','access']),detail:z.string().trim().min(10).max(3000)})}),
 z.object({action:z.literal('cancel'),payload:z.object({id:z.string().uuid()})}),
 z.object({action:z.literal('respond'),payload:z.object({id:z.string().uuid(),response:z.string().trim().min(10).max(3000),status:z.enum(['reviewing','responded'])})}),
]);
export async function GET(request:Request){try{const {client}=await authenticatedClient();let page=Math.max(0,Math.min(10000,Math.floor(Number(new URL(request.url).searchParams.get('page'))||0)));const query=client.from('privacy_requests').select('id,user_id,requester_email,kind,detail,status,response,created_at,updated_at',{count:'exact'}).order('created_at',{ascending:false}).order('id');let result=await query.range(page*20,page*20+19);if(result.error?.code==='PGRST103'){page=0;result=await query.range(0,19);}if(result.error)throw result.error;return response({requests:result.data,total:result.count,page});}catch(error){return failure(error);}}
export async function POST(request:Request){try{sameOrigin(request);const {client}=await authenticatedClient();const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the request fields.');const {data,error}=await client.rpc('jp_privacy_command',parsed.data);if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Request could not be saved.');return response({result:data});}catch(error){return failure(error);}}
