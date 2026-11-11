'use client';
import {useState} from 'react';
import Captcha,{resetCaptcha} from './captcha';
import {Btn,Field} from './market-ui';
const names:Record<string,string>={google:'Google',apple:'Apple',linkedin_oidc:'LinkedIn'};
async function post(body:unknown){const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string;url?:string};if(!r.ok)throw new Error(d.error||'Please try again.');return d;}
function Mark({provider}:{provider:string}){
 if(provider==='google')return <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>;
 return null;
}
// "Continue with Google" and the other enabled providers, shown above both the sign-in and the create-account form.
// The portal the person started in is remembered for a few minutes so they come back to it after the provider's screen.
// The list of enabled providers comes from the server, which asks Supabase which ones are switched on.
export function SocialSignIn({portal,providers}:{portal:'seeker'|'employer';providers:string[]}){
 const [busy,B]=useState(''),[error,E]=useState('');
 const shown=providers.filter(p=>names[p]);
 if(!shown.length)return null;
 return <div className="social-sign-in">
  {shown.map(p=><button key={p} type="button" className="social-btn" disabled={!!busy} onClick={async()=>{B(p);E('');try{const d=await post({action:'oauth',provider:p});document.cookie=`jr_after=${portal};path=/;max-age=600;samesite=lax`;window.location.assign(d.url!);}catch(e){E((e as Error).message);B('');}}}><Mark provider={p}/>{busy===p?'Opening…':`Continue with ${names[p]}`}</button>)}
  {error&&<p role="alert" className="notice error">{error}</p>}
  <p className="social-or"><span>or</span></p>
 </div>;
}
export default function SignInOptions(){
 const [busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 return <div className="sign-in-options">
  <details><summary className="text-link">Email me a sign-in link instead</summary>
   <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');M('');try{await post({action:'magic',email:f.get('email'),captcha:f.get('captcha')||undefined});M('Check your email for a sign-in link. It works once and expires within an hour.');}catch(err){E((err as Error).message);}finally{B(false);resetCaptcha();}}}>
    <Field label="Email"><input name="email" type="email" autoComplete="email" required/></Field><Captcha/><Btn secondary disabled={busy}>Send sign-in link</Btn>
   </form></details>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </div>;
}
