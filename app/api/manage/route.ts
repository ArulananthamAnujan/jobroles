import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('resume.delete'),id}),
 z.object({action:z.literal('draft.discard'),id}),
 z.object({action:z.literal('contribution.delete'),kind:z.enum(['review','salary','interview','question','answer']),id}),
 z.object({action:z.literal('note.delete'),id}),
 z.object({action:z.literal('job.delete'),id}),
 z.object({action:z.literal('member.role'),companyId:id,userId:id,role:z.enum(['recruiter','hiring_manager'])}),
]);
const fail=(e:{code?:string;message?:string})=>new ApiError(e.code==='42501'?403:e.code==='PGRST202'?503:400,['42501','22023'].includes(e.code||'')&&e.message?e.message:e.code==='PGRST202'?'This needs the latest database update. Please contact support.':'That could not be done. Please try again.');
// Removing and managing your own things. The database checks that each one belongs to the person asking.
export async function GET(request:Request){try{
 const {client}=await authenticatedClient();
 const resource=new URL(request.url).searchParams.get('resource');
 // Jobs the person marked "Not interested", so they can bring one back.
 if(resource==='hidden'){const {data,error}=await client.from('hidden_jobs').select('job_id,created_at,jobs(title,companies(name))').order('created_at',{ascending:false}).limit(100);if(error)throw new ApiError(503,'Hidden jobs could not be loaded.');return response({hidden:data});}
 if(resource!=='contributions')throw new ApiError(400,'Unknown resource.');
 const {data,error}=await client.rpc('jp_my_contributions');if(error)throw fail(error);
 return response({data});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the details and try again.');
 const d=parsed.data;
 if(d.action==='resume.delete'){
  const {data,error}=await client.rpc('jp_delete_resume',{target:d.id});if(error)throw fail(error);
  // The record is gone; now remove the file itself. If that fails the file is unreachable anyway and is cleared with the account.
  const key=(data as {storageKey?:string}|null)?.storageKey;if(key)await client.storage.from('resumes').remove([key]).catch(()=>{});
  return response({ok:true});
 }
 const {error}=d.action==='draft.discard'?await client.rpc('jp_discard_draft',{target:d.id})
  :d.action==='contribution.delete'?await client.rpc('jp_delete_contribution',{kind:d.kind,target:d.id})
  :d.action==='note.delete'?await client.rpc('jp_delete_note',{target:d.id})
  :d.action==='job.delete'?await client.rpc('jp_delete_draft_job',{target:d.id})
  :await client.rpc('jp_change_role',{company:d.companyId,member:d.userId,new_role:d.role});
 if(error)throw fail(error);
 return response({ok:true});
}catch(e){return failure(e);}}
