'use client';
import {useState} from 'react';
import Captcha,{resetCaptcha} from './captcha';
import {Btn,Field} from './market-ui';
// Providers are listed in NEXT_PUBLIC_AUTH_PROVIDERS (google, apple, linkedin_oidc) once enabled in Supabase Auth.
const providers=(process.env.NEXT_PUBLIC_AUTH_PROVIDERS||'').split(',').map(s=>s.trim()).filter(Boolean);
const names:Record<string,string>={google:'Google',apple:'Apple',linkedin_oidc:'LinkedIn'};
async function post(body:unknown){const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string;url?:string};if(!r.ok)throw new Error(d.error||'Please try again.');return d;}
export default function SignInOptions(){
 const [busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 return <div className="sign-in-options">
  {providers.filter(p=>names[p]).map(p=><Btn key={p} secondary type="button" disabled={busy} onClick={async()=>{B(true);E('');try{const d=await post({action:'oauth',provider:p});window.location.assign(d.url!);}catch(e){E((e as Error).message);B(false);}}}>Continue with {names[p]}</Btn>)}
  <details><summary className="text-link">Email me a sign-in link instead</summary>
   <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');M('');try{await post({action:'magic',email:f.get('email'),captcha:f.get('captcha')||undefined});M('Check your email for a sign-in link. It works once and expires within an hour.');}catch(err){E((err as Error).message);}finally{B(false);resetCaptcha();}}}>
    <Field label="Email"><input name="email" type="email" autoComplete="email" required/></Field><Captcha/><Btn secondary disabled={busy}>Send sign-in link</Btn>
   </form></details>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </div>;
}
