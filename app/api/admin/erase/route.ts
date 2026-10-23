import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
// Forwards an administrator's erasure request, with their own token, to the account-erasure Edge Function.
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const body=await jsonBody(request) as {userId?:unknown};
 if(typeof body?.userId!=='string')throw new ApiError(400,'Choose an account.');
 const {data:{session}}=await client.auth.getSession();if(!session)throw new ApiError(401,'Please sign in.');
 const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/account-erasure`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({userId:body.userId}),cache:'no-store'});
 const d=await r.json().catch(()=>({})) as {error?:string};
 if(!r.ok)throw new ApiError([400,401,403,409].includes(r.status)?r.status:502,d.error||'Erasure is unavailable.');
 return response(d);
}catch(e){return failure(e);}}
