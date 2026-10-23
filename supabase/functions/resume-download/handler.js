export function makeHandler(createClient, env) {
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status,error)=>Response.json({error},{status,headers});
 return async request=>{
  try {
   if(request.method!=='POST')return fail(405,'Method not allowed.');
   const authorization=request.headers.get('authorization');
   if(!authorization?.startsWith('Bearer '))return fail(401,'Sign in required.');
   const url=env('SUPABASE_URL');
   const userClient=createClient(url,env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:identity,error:authError}=await userClient.auth.getUser(authorization.slice(7));
   if(authError||!identity.user?.email_confirmed_at)return fail(401,'Confirmed account required.');
   const raw=await request.text();if(raw.length>512)return fail(413,'Request too large.');
   let id;try{({id}=JSON.parse(raw));}catch{return fail(400,'Invalid request.');}
   if(typeof id!=='string'||!(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i).test(id))return fail(404,'Resume unavailable.');
   const {data:resume,error}=await userClient.from('resume_versions').select('storage_key,filename,mime_type,user_id,scan_status').eq('id',id).is('deleted_at',null).maybeSingle();
   if(error||!resume)return fail(404,'Resume unavailable.');
   if(resume.scan_status==='infected')return fail(423,'This file failed a malware check and cannot be downloaded.');
   // With scanning required, only the owner may open a file before the scanner has passed it.
   if(env('RESUME_SCAN_REQUIRED')==='true'&&resume.user_id!==identity.user.id&&resume.scan_status!=='clean')return fail(423,'This resume is still being checked for malware. Try again in a few minutes.');
   // Privileged storage is reached only after the caller's live RLS authorization.
   const storage=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:file,error:downloadError}=await storage.storage.from('resumes').download(resume.storage_key);
   if(downloadError||!file)return fail(404,'Resume unavailable.');
   return new Response(file,{headers:{...headers,'Content-Type':resume.mime_type,'Content-Disposition':`attachment; filename="resume"; filename*=UTF-8''${encodeURIComponent(resume.filename).replace(/'/g,'%27')}`,'Content-Security-Policy':"sandbox; default-src 'none'"}});
  }catch{return fail(500,'Resume could not be downloaded.');}
 };
}
