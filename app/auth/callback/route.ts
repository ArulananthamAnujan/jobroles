import {accountClient} from '@/lib/backend/server';
import {confirmationFields} from '@/lib/auth-mail';
import {reportError} from '@/lib/error-report';
const leave=(to:string)=>new Response(null,{status:303,headers:{Location:to,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
// Where every emailed account link lands. It understands three kinds of link:
//  1. A one-time token (?token_hash=…&type=recovery|email|signup|magiclink), used by the templates in docs/email-templates.
//     Opening it does not use the token up: the person confirms on the next page, so an email scanner that pre-opens
//     links cannot sign in or spend the link. It works in any browser.
//  2. A sign-in code (?code=…), which "Continue with Google" and the other providers return (and Supabase's default
//     email templates used to). Someone who started in the employer portal goes back there (jr_after cookie). It only works in the browser that asked
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
 // "Continue with Google" leaves a short-lived note of which portal the person started in. When it is present this is
 // a provider sign-in, and a failure goes back to that portal's sign-in form with the reason, not to an email page.
 const after=/(?:^|;\s*)jr_after=(seeker|employer)(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1],home=after==='employer'?'/employer':'/job-seeker';
 const done=(to:string)=>{const r=leave(to);if(after)r.headers.append('Set-Cookie','jr_after=; Path=/; Max-Age=0; SameSite=Lax');return r;};
 let why='';
 if(code&&code.length<=4096){
  try{const client=await accountClient();const {error}=await client.auth.exchangeCodeForSession(code);
   if(!error)return done(recovery?'/account/reset':after==='employer'?'/employer?confirmed=1':'/account?confirmed=1');
   // "cookie": this browser did not send back the cookie that was set when the button was pressed (private window,
   // a container or cookie-blocking add-on, or cookies cleared part-way). "expired": the code was already used or too old.
   why=error.code==='pkce_code_verifier_not_found'||error.name==='AuthPKCECodeVerifierMissingError'?'cookie':/expired|already|invalid|flow state/i.test(error.message)?'expired':'failed';
   void reportError(new Error(`Provider sign-in failed (${why}): ${error.code||error.name}: ${error.message}`),{source:'auth-callback',path:'/auth/callback'});
  }catch(e){why='failed';void reportError(e,{source:'auth-callback',path:'/auth/callback'});}
 }else if(after&&p.get('error')){
  // The provider or Supabase refused before any code was issued, for example the person pressed Cancel on Google's screen.
  why=p.get('error')==='access_denied'?'cancelled':'provider';
  void reportError(new Error(`Provider sign-in refused: ${p.get('error')}: ${p.get('error_code')||''} ${p.get('error_description')||''}`),{source:'auth-callback',path:'/auth/callback'});
 }
 if(after&&why&&!recovery)return done(`${home}?signin=${why}`);
 // Nothing usable in the query. A link that works in any browser carries its session after the "#", which only the
 // browser can read and which survives this redirect, so the verify page takes it from there. Supabase reported
 // errors (expired or used links) arrive as ?error=… and go straight to the explanation.
 if(recovery&&(code||p.get('error')))return leave('/account/reset?error=link');
 return leave(`/account/verify?error=invalid${recovery?'&flow=recovery':''}`);
}
