import {accountClient,response,failure,ApiError,sameOrigin,jsonBody} from '@/lib/backend/server';
import {confirmationFields,confirmationDestination} from '@/lib/auth-mail';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
// GET does not consume one-time tokens. Email-security prefetching must not sign in.
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,fields=confirmationFields(p.get('token_hash'),p.get('type'));
 const fragment=fields?new URLSearchParams(fields).toString():'';
 return new Response(null,{status:303,headers:{...headers,Location:fields?`/account/verify#${fragment}`:'/account/verify?error=invalid'}});
}
export async function POST(request:Request){try{
 sameOrigin(request);const body=await jsonBody(request);const fields=confirmationFields(body?.token_hash,body?.type);
 if(!fields)throw new ApiError(400,'This link is incomplete. Request a fresh email below.');
 const client=await accountClient();const {error}=await client.auth.verifyOtp(fields);
 if(error)throw new ApiError(400,'This link has expired or was already used. Try signing in, or request a fresh email below.');
 return response({ok:true,next:confirmationDestination(fields.type)});
}catch(error){return failure(error);}}
