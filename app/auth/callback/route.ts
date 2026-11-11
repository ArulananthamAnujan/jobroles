import {accountClient} from '@/lib/backend/server';
import {confirmationFields} from '@/lib/auth-mail';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,code=p.get('code');let next='/account/verify?error=invalid';
 // Email templates may link here with a one-time token (?token_hash=…&type=recovery) instead of a sign-in code.
 // Like /auth/confirm, opening the link does not use the token up: the person confirms on the next page, so an
 // email scanner that pre-opens links cannot sign in or spend the link. Recovery then goes on to set a new password.
 const fields=confirmationFields(p.get('token_hash'),p.get('type'));
 if(!code&&fields)return new Response(null,{status:303,headers:{Location:`/account/verify#${new URLSearchParams(fields)}`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 if(code&&code.length<=4096){try{const client=await accountClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)next=p.get('flow')==='recovery'?'/account/reset':'/account?confirmed=1';}catch{}}
 return new Response(null,{status:303,headers:{Location:next,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
