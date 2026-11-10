import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {resolveSource} from '@/supabase/functions/job-feed-import/parse';
import {readFeed} from '@/supabase/functions/job-feed-import/handler';
export const dynamic='force-dynamic';
export const maxDuration=60;
const id=z.string().uuid();
const format=z.enum(['auto','greenhouse','lever','ashby','smartrecruiters','xml','json']);
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('check'),source:z.string().trim().min(2).max(2000),format}),
 z.object({action:z.literal('add'),name:z.string().trim().min(2).max(160),website:z.string().trim().max(300).default(''),source:z.string().trim().min(2).max(2000),format,autoPublish:z.boolean().default(true)}),
 z.object({action:z.enum(['run','pause','resume','delete']),id}),
 z.object({action:z.literal('claim'),companyId:id,email:z.string().trim().email().max(254)}),
 z.object({action:z.literal('verify'),companyId:id,abn:z.string().regex(/^\d{11}$/),reason:z.string().trim().min(3).max(500)}),
]);
const fail=(e:{code?:string;message?:string}|null)=>new ApiError(e?.code==='42501'?403:400,e?.code==='42501'?'Administrator required.':e?.code==='22023'&&e.message?e.message:'That could not be done.');
function source(input:string,kind:z.infer<typeof format>){
 const found=resolveSource(input,kind==='auto'?undefined:kind);
 if(!found)throw new ApiError(400,kind==='auto'?'We could not tell which system that link is from. Choose the system, or paste a Greenhouse, Lever, Ashby or SmartRecruiters careers link.':'That does not look like a valid link or board name for the system you chose.');
 return found;
}
// Asks the import worker to run now. Without its secret on this server the feed simply waits for the next scheduled pass.
async function runWorker(token:string){
 const secret=process.env.JOB_FEED_WORKER_SECRET;if(!secret)return 'scheduled';
 try{const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/job-feed-import`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'x-job-feed-secret':secret},cache:'no-store',signal:AbortSignal.timeout(50000)});return r.ok?'ran':'scheduled';}catch{return 'scheduled';}
}
// Job sourcing for administrators: list employers' public careers feeds so the board has roles before those employers join.
export async function GET(){try{
 const {client}=await authenticatedClient();const {data,error}=await client.rpc('jp_sources');if(error)throw fail(error);return response({data});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Check the details and try again.');
 const d=parsed.data;
 const {data:isAdmin}=await client.rpc('jp_is_admin');if(!isAdmin)throw new ApiError(403,'Administrator required.');
 if(d.action==='check'){
  const found=source(d.source,d.format);
  let result;try{result=await readFeed(found);}catch(e){throw new ApiError(400,`We could not read that feed: ${(e as Error).message||'no response'}.`);}
  return response({result:{...found,total:result.items.length,rejected:result.rejected,withPay:result.items.filter(i=>i.min!==null).length,sample:result.items.slice(0,6).map(i=>({title:i.title,location:i.locations.join(' · '),type:i.type,pay:i.min===null?null:`$${i.min.toLocaleString('en-AU')}–$${i.max!.toLocaleString('en-AU')} per ${i.period}`}))}});
 }
 if(d.action==='add'){
  const found=source(d.source,d.format);
  const website=d.website&&!/^https:\/\//.test(d.website)?`https://${d.website.replace(/^http:\/\//,'')}`:d.website;
  const {data,error}=await client.rpc('jp_source_command',{action:'create',payload:{name:d.name,website,url:found.url,format:found.format,autoPublish:d.autoPublish}});if(error)throw fail(error);
  const {data:{session}}=await client.auth.getSession();
  return response({result:data,worker:session?await runWorker(session.access_token):'scheduled'});
 }
 if(d.action==='run'){
  const {error}=await client.rpc('jp_source_command',{action:'run',payload:{id:d.id}});if(error)throw fail(error);
  const {data:{session}}=await client.auth.getSession();
  return response({worker:session?await runWorker(session.access_token):'scheduled'});
 }
 if(d.action==='claim'||d.action==='verify'){const {error}=await client.rpc('jp_source_command',{action:d.action,payload:d});if(error)throw fail(error);return response({ok:true});}
 const {error}=await client.rpc('jp_feed_command',{action:d.action,payload:{id:d.id}});if(error)throw fail(error);
 return response({ok:true});
}catch(e){return failure(e);}}
