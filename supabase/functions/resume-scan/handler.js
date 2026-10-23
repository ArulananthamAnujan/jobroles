// Scans pending resumes. Deploy with verify_jwt:true and call it on a schedule with the worker secret.
// RESUME_SCANNER_URL receives the raw file in a POST and must answer JSON {"clean": true|false};
// a small ClamAV service (for example on Cloud Run or Fly.io) satisfies this contract.
export function makeScanWorker(createClient,env,send=fetch){
 const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
  const secret=env('RESUME_SCAN_WORKER_SECRET');
  if(!secret||request.headers.get('x-resume-scan-secret')!==secret)return reply(401,{error:'Unauthorised'});
  const scanner=env('RESUME_SCANNER_URL');if(!scanner)return reply(503,{error:'Resume scanner is not configured'});
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:pending,error}=await client.from('resume_versions').select('id,storage_key').eq('scan_status','pending').order('created_at').limit(20);
  if(error)return reply(503,{error:'Resume queue unavailable'});
  let clean=0,infected=0,failed=0;
  for(const r of pending||[]){
   try{
    const {data:file,error:downloadError}=await client.storage.from('resumes').download(r.storage_key);if(downloadError||!file)throw Error('download');
    const res=await send(scanner,{method:'POST',headers:{'Content-Type':'application/octet-stream',...(env('RESUME_SCANNER_TOKEN')?{Authorization:`Bearer ${env('RESUME_SCANNER_TOKEN')}`}:{})},body:file,signal:AbortSignal.timeout(30000)});
    const verdict=await res.json();if(!res.ok||typeof verdict?.clean!=='boolean')throw Error('verdict');
    const {error:recordError}=await client.rpc('jp_record_resume_scan',{target:r.id,result:verdict.clean?'clean':'infected'});if(recordError)throw recordError;
    if(verdict.clean)clean++;else infected++;
   }catch{failed++;}
  }
  return reply(200,{clean,infected,failed});
 };
}
