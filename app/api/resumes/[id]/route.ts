import {authenticatedClient,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Resume unavailable.');
 const {client}=await authenticatedClient();
 // getUser above establishes authorization; getSession here only retrieves the transport token.
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw new ApiError(401,'Please sign in.');
 const result=await fetch(`${process.env.SUPABASE_URL}/functions/v1/resume-download`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({id}),cache:'no-store'});
 if(!result.ok)throw new ApiError(result.status===401?401:404,'Resume unavailable.');
 return new Response(result.body,{headers:{'Content-Type':result.headers.get('Content-Type')||'application/octet-stream','Content-Disposition':result.headers.get('Content-Disposition')||'attachment; filename="resume"','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}catch(error){return failure(error);}}
