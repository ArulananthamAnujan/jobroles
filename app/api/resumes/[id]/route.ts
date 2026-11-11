import {authenticatedClient,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
const safe={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"};
// Downloads a resume the signed-in person is allowed to see: their own, or one submitted to a job their role covers.
// The database decides that (row-level security on resume_versions and on the stored file), so the file is read
// with the person's own session. Projects that have not applied that database update yet fall back to the
// resume-download function, which makes the same check before using its service key.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Resume unavailable.');
 const {client}=await authenticatedClient();
 const {data:resume}=await client.from('resume_versions').select('storage_key,filename,mime_type,scan_status').eq('id',id).is('deleted_at',null).maybeSingle();
 if(!resume)throw new ApiError(404,'Resume unavailable.');
 if(resume.scan_status==='infected')throw new ApiError(423,'This file failed a malware check and cannot be downloaded.');
 const {data:file}=await client.storage.from('resumes').download(resume.storage_key);
 if(file)return new Response(file,{headers:{...safe,'Content-Type':resume.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename="resume"; filename*=UTF-8''${encodeURIComponent(resume.filename||'resume').replace(/'/g,'%27')}`}});
 // getUser above establishes authorization; getSession here only retrieves the transport token.
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw new ApiError(401,'Please sign in.');
 const result=await fetch(`${process.env.SUPABASE_URL}/functions/v1/resume-download`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({id}),cache:'no-store'});
 if(result.status===423)throw new ApiError(423,'This resume is still being checked for malware. Try again in a few minutes.');
 if(!result.ok)throw new ApiError(result.status===401?401:404,'Resume unavailable.');
 return new Response(result.body,{headers:{...safe,'Content-Type':result.headers.get('Content-Type')||'application/octet-stream','Content-Disposition':result.headers.get('Content-Disposition')||'attachment; filename="resume"'}});
}catch(error){return failure(error);}}
