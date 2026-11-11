import {accountClient} from '@/lib/backend/server';
import {confirmationFields} from '@/lib/auth-mail';
const leave=(to:string)=>new Response(null,{status:303,headers:{Location:to,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
// Where every emailed account link lands. It understands three kinds of link:
//  1. A one-time token (?token_hash=…&type=recovery|email|signup|magiclink), used by the templates in docs/email-templates.
//     Opening it does not use the token up: the person confirms on the next page, so an email scanner that pre-opens
//     links cannot sign in or spend the link. It works in any browser.
//  2. A sign-in code (?code=…), which Supabase's default templates produce. It only works in the browser that asked
//     for the email, and only once, so it fails when opened on another device or after a mail scanner has opened it.
//  3. A short-lived session after the "#" (#access_token=…), which is how this site now asks Supabase to send
//     confirmation, reset and sign-in links so that they work in any browser. The verify page reads it.
//  4. An error from Supabase (?error=… or #error=…), when the link had expired or was already used.
// A failed password-reset link goes back to the reset form with an explanation, not to the email-confirmation page.
export async function GET(request:Request){
 // Some mail programs deliver "&amp;" literally; read those parameters too.
 const raw=new URL(request.url).searchParams,p=new URLSearchParams();
 for(const [k,v] of raw)p.set(k.replace(/^amp;/,''),v);
 const code=p.get('code'),recovery=p.get('flow')==='recovery'||p.get('type')==='recovery';
 const fields=confirmationFields(p.get('token_hash'),p.get('type'));
 if(!code&&fields)return leave(`/account/verify#${new URLSearchParams(fields)}`);
 if(code&&code.length<=4096){try{const client=await accountClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return leave(recovery?'/account/reset':'/account?confirmed=1');}catch{}}
 // Nothing usable in the query. A link that works in any browser carries its session after the "#", which only the
 // browser can read and which survives this redirect, so the verify page takes it from there. Supabase reported
 // errors (expired or used links) arrive as ?error=… and go straight to the explanation.
 if(recovery&&(code||p.get('error')))return leave('/account/reset?error=link');
 return leave(`/account/verify?error=invalid${recovery?'&flow=recovery':''}`);
}
