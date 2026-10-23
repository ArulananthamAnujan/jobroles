import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
// Forwards to the billing Edge Function with the employer's own token; Stripe keys never reach this server.
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const body=await jsonBody(request) as {jobId?:unknown};if(typeof body?.jobId!=='string')throw new ApiError(400,'Choose a role.');
 const {data:{session}}=await client.auth.getSession();if(!session)throw new ApiError(401,'Please sign in.');
 const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/billing/checkout`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:JSON.stringify({jobId:body.jobId}),cache:'no-store'});
 const d=await r.json().catch(()=>({})) as {url?:string;error?:string};
 if(!r.ok||!d.url?.startsWith('https://checkout.stripe.com/'))throw new ApiError([400,401,403,409,503].includes(r.status)?r.status:502,d.error||'Checkout is unavailable right now.');
 return response({url:d.url});
}catch(e){return failure(e);}}
