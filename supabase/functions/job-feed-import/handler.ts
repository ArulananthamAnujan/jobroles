import {parseJsonFeed,parseXmlFeed,parseGreenhouse,parseLever,parseAshby,parseSmartRecruiters,safeFeedUrl,type SourceFormat} from './parse.ts';
type Feed={id:string;url:string;format:SourceFormat;lease:string};
// Employer-written feeds stay small. Job-board APIs list every role a company has worldwide, so they get more room.
const MAX_BYTES=5*1024*1024,MAX_BOARD_BYTES=30*1024*1024;
async function readLimited(res:Response,limit=MAX_BYTES){
 const reader=res.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error(`Feed is larger than ${Math.round(limit/1048576)} MB`);}chunks.push(value);}
 const bytes=new Uint8Array(size);let o=0;for(const c of chunks){bytes.set(c,o);o+=c.length;}
 return new TextDecoder().decode(bytes);
}
// Follows at most three redirects, re-checking each address, so a feed cannot bounce the worker to a private host.
export async function fetchFeed(url:string,send:typeof fetch=fetch,limit=MAX_BYTES){
 let current=url;
 for(let hop=0;hop<4;hop++){
  if(!safeFeedUrl(current))throw new Error('Feed address must be a public https URL');
  const res=await send(current,{redirect:'manual',headers:{Accept:'application/json, application/xml, text/xml','User-Agent':'JobRoles feed importer'},signal:AbortSignal.timeout(20000)});
  if(res.status>=300&&res.status<400&&res.headers.get('location')){current=new URL(res.headers.get('location')!,current).toString();continue;}
  if(!res.ok)throw new Error(`Feed returned HTTP ${res.status}`);
  return readLimited(res,limit);
 }
 throw new Error('Too many redirects');
}
// SmartRecruiters lists postings without their text, so each Australian posting is fetched in turn, a few at a time.
export async function collectSmartRecruiters(url:string,send:typeof fetch=fetch,cap=300){
 const base=url.split('?')[0],ids:string[]=[];
 for(let offset=0;offset<cap;offset+=100){
  const page=JSON.parse(await fetchFeed(`${base}?country=au&limit=100&offset=${offset}`,send)) as {content?:{id?:string}[];totalFound?:number};
  if(!Array.isArray(page.content))throw new Error('SmartRecruiters response has no postings; check the company name');
  ids.push(...page.content.map(p=>String(p.id||'')).filter(id=>/^\d+$/.test(id)));
  if(page.content.length<100||ids.length>=Number(page.totalFound||0))break;
 }
 const postings:Record<string,unknown>[]=[];
 for(let i=0;i<ids.length&&i<cap;i+=6)postings.push(...(await Promise.all(ids.slice(i,i+6).map(id=>fetchFeed(`${base}/${id}`,send).then(t=>JSON.parse(t) as Record<string,unknown>).catch(()=>null)))).filter((p):p is Record<string,unknown>=>!!p));
 return parseSmartRecruiters(postings);
}
export async function readFeed(feed:{url:string;format:SourceFormat},send:typeof fetch=fetch){
 if(feed.format==='smartrecruiters')return collectSmartRecruiters(feed.url,send);
 const parse={json:parseJsonFeed,xml:parseXmlFeed,greenhouse:parseGreenhouse,lever:parseLever,ashby:parseAshby}[feed.format];if(!parse)throw new Error('Unknown feed format');
 return parse(await fetchFeed(feed.url,send,feed.format==='json'||feed.format==='xml'?MAX_BYTES:MAX_BOARD_BYTES));
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
    const {items}=await readFeed(feed,send);
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
