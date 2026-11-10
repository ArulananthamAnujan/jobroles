import {z} from 'zod';
import {resolveSource} from '@/supabase/functions/job-feed-import/parse';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),payload:z.object({companyId:id,url:z.string().url().max(2000).startsWith('https://'),format:z.enum(['json','xml','greenhouse','lever','ashby','smartrecruiters'])})}),
 z.object({action:z.literal('pause'),payload:z.object({id})}),z.object({action:z.literal('resume'),payload:z.object({id})}),z.object({action:z.literal('delete'),payload:z.object({id})}),
 z.object({action:z.literal('trust'),payload:z.object({id,autoPublish:z.boolean()})}),
]);
export async function GET(){try{const {client}=await authenticatedClient();const {data,error}=await client.from('job_feeds').select('id,company_id,url,format,active,auto_publish,created_at,last_run_at,last_status,last_error').order('created_at');if(error)throw new ApiError(503,'Feeds could not be loaded.');return response({feeds:data});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Enter an https feed address and choose its format.');
 // A pasted careers-page link is turned into the address the importer reads.
 let payload:unknown=parsed.data.payload;
 if(parsed.data.action==='create'){const found=resolveSource(parsed.data.payload.url,parsed.data.payload.format);if(!found)throw new ApiError(400,'That link does not match the system you chose. Paste your careers page link or feed address.');payload={...parsed.data.payload,url:found.url,format:found.format};}
 const {data,error}=await client.rpc('jp_feed_command',{action:parsed.data.action,payload});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'The feed could not be saved.');
 return response({result:data});
}catch(e){return failure(e);}}
