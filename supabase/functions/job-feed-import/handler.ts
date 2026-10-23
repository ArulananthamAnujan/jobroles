import {parseJsonFeed,parseXmlFeed,safeFeedUrl} from './parse.ts';
type Feed={id:string;url:string;format:'json'|'xml';lease:string};
const MAX_BYTES=5*1024*1024;
async function readLimited(res:Response){
 const reader=res.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error('Feed is larger than 5 MB');}chunks.push(value);}
 const bytes=new Uint8Array(size);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length;}
 return new TextDecoder().decode(bytes);
}
// Follows at most three redirects, re-checking each address, so a feed cannot bounce the worker to a private host.
export async function fetchFeed(url:string,send:typeof fetch=fetch){
 let current=url;
 for(let hop=0;hop<4;hop++){
  if(!safeFeedUrl(current))throw new Error('Feed address must be a public https URL');
  const res=await send(current,{redirect:'manual',headers:{Accept:'application/json, application/xml, text/xml','User-Agent':'JobRoles feed importer'},signal:AbortSignal.timeout(20000)});
  if(res.status>=300&&res.status<400&&res.headers.get('location')){current=new URL(res.headers.get('location')!,current).toString();continue;}
  if(!res.ok)throw new Error(`Feed returned HTTP ${res.status}`);
  return readLimited(res);
 }
 throw new Error('Too many redirects');
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeFeedWorker(createClient:(url:string,key:string,opts:object)=>any,env:(n:string)=>string|undefined,send:typeof fetch=fetch){
 const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async(request:Request)=>{
  if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
  const secret=env('JOB_FEED_WORKER_SECRET');
  if(!secret||request.headers.get('x-job-feed-secret')!==secret)return reply(401,{error:'Unauthorised'});
  const client=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:feeds,error}=await client.rpc('jp_claim_job_feeds');
  if(error)return reply(503,{error:'Feed queue unavailable'});
  const results:Record<string,unknown>[]=[];
  for(const feed of (feeds||[]) as Feed[]){
   try{
    const body=await fetchFeed(feed.url,send);
    const {items}=feed.format==='json'?parseJsonFeed(body):parseXmlFeed(body);
    const {data,error:importError}=await client.rpc('jp_import_feed',{feed:feed.id,lease:feed.lease,items});
    if(importError)throw importError;results.push({feed:feed.id,...data});
   }catch(e){
    await client.rpc('jp_import_feed',{feed:feed.id,lease:feed.lease,items:null,problem:(e as Error).message?.slice(0,300)||'Feed could not be read'});
    results.push({feed:feed.id,failed:true});
   }
  }
  return reply(200,{feeds:results});
 };
}
