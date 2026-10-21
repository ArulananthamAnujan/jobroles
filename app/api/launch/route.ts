import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
const text=z.string().trim().min(10).max(2000);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('search.save'),payload:z.object({filters:z.object({q:z.string().max(120).optional(),location:z.string().max(120).optional(),company:z.string().max(120).optional(),arrangement:z.enum(['','remote','hybrid','on_site']).optional(),type:z.string().max(120).optional(),sort:z.enum(['newest','salary']).optional(),salaryMin:z.string().max(20).optional(),salaryMax:z.string().max(20).optional(),salaryPeriod:z.enum(['year','month','day','hour']).optional()})})}),
 z.object({action:z.literal('search.delete'),payload:z.object({id:z.string().uuid()})}),
 z.object({action:z.literal('job.report'),payload:z.object({jobId:z.string().uuid(),reason:text})}),
 z.object({action:z.literal('report.resolve'),payload:z.object({id:z.string().uuid(),reason:text,pause:z.boolean()})}),
]);
export async function POST(request:Request){try{sameOrigin(request);const {client}=await authenticatedClient();const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Please check the form fields.');const {data,error}=await client.rpc('jp_launch_command',parsed.data);if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Unable to save this change.');return response({result:data});}catch(error){return failure(error);}}
export async function GET(){try{const {client,user}=await authenticatedClient();const [searches,reports]=await Promise.all([client.from('saved_searches').select('id,filters,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20),client.from('job_reports').select('id,job_id,reason,state,resolution,created_at').order('created_at',{ascending:false}).limit(100)]);if(searches.error||reports.error)throw new ApiError(503,'Saved searches and reports could not be loaded.');return response({searches:searches.data,reports:reports.data});}catch(error){return failure(error);}}
