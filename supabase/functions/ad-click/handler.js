// Charges a sponsored-job click. Only the JobRoles web server calls this, with the shared AD_CLICK_SECRET and a
// visitor fingerprint it derived from the browser's IP address and user agent; the database charges each visitor
// once per job per day. Deploy with verify_jwt:false.
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export function makeAdClickHandler(createClient,env){
 const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  if(request.method!=='POST')return reply(405,{error:'Method not allowed.'});
  const secret=env('AD_CLICK_SECRET');
  if(!secret||!safeEqual(request.headers.get('x-worker-secret')||'',secret))return reply(401,{error:'Unauthorised.'});
  let body;try{body=JSON.parse(await request.text());}catch{return reply(400,{error:'Invalid request.'});}
  if(typeof body?.jobId!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.jobId)||typeof body.visitor!=='string'||!/^[0-9a-f]{32,128}$/.test(body.visitor))return reply(400,{error:'Invalid request.'});
  const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.rpc('jp_record_sponsored_click',{target:body.jobId,visitor_key:body.visitor});
  if(error)return reply(500,{error:'Could not record the click.'});
  return reply(200,data);
 };
}
