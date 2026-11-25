import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
import {resumeText} from '@/lib/backend/resume-autofill';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const safe={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"};
// Downloads a resume the signed-in person is allowed to see: their own, or one submitted to a job their role covers.
// The database decides that (row-level security on resume_versions and on the stored file), so the file is read
// with the person's own session. Projects that have not applied that database update yet fall back to the
// resume-download function, which makes the same check before using its service key.
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Resume unavailable.');
 const {client}=await authenticatedClient();
 const {data:resume}=await client.from('resume_versions').select('storage_key,filename,mime_type,scan_status').eq('id',id).is('deleted_at',null).maybeSingle();
 if(!resume)throw new ApiError(404,'Resume unavailable.');
 if(resume.scan_status==='infected')throw new ApiError(423,'This file failed a malware check and cannot be downloaded.');
 const {data:file}=await client.storage.from('resumes').download(resume.storage_key);
 // The resume as plain text, for reading inside the applicant panel. Same permission as downloading it.
 if(new URL(request.url).searchParams.get('view')==='text'){
  let bytes:Uint8Array|null=file?new Uint8Array(await file.arrayBuffer()):null;
  if(!bytes){const {data:{session}}=await client.auth.getSession();
   const viaFunction=session?await fetch(`${process.env.SUPABASE_URL}/functions/v1/resume-download`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({id}),cache:'no-store'}).catch(()=>null):null;
   if(!viaFunction?.ok)throw new ApiError(404,'Resume unavailable.');bytes=new Uint8Array(await viaFunction.arrayBuffer());}
  const name=resume.filename||'resume',kind=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'?'pdf':/\.docx$/i.test(name)||/wordprocessingml/.test(resume.mime_type||'')?'docx':'other';
  let text='';try{text=(await resumeText(bytes)).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,60000);}catch{}
  return response({filename:name,kind,text});
 }
 if(file)return new Response(file,{headers:{...safe,'Content-Type':resume.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename="resume"; filename*=UTF-8''${encodeURIComponent(resume.filename||'resume').replace(/'/g,'%27')}`}});
 // getUser above establishes authorization; getSession here only retrieves the transport token.
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw new ApiError(401,'Please sign in.');
 const result=await fetch(`${process.env.SUPABASE_URL}/functions/v1/resume-download`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({id}),cache:'no-store'});
 if(result.status===423)throw new ApiError(423,'This resume is still being checked for malware. Try again in a few minutes.');
 if(!result.ok)throw new ApiError(result.status===401?401:404,'Resume unavailable.');
 return new Response(result.body,{headers:{...safe,'Content-Type':result.headers.get('Content-Type')||'application/octet-stream','Content-Disposition':result.headers.get('Content-Disposition')||'attachment; filename="resume"'}});
}catch(error){return failure(error);}}
