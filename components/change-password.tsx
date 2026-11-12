'use client';
import {useState} from 'react';
import PasswordField,{PASSWORD_HINT,passwordProblem} from './password-field';
// Change your password while signed in. For safety every device is signed out afterwards, including this one.
export default function ChangePassword({returnTo}:{returnTo:string}){
 const [open,O]=useState(false),[busy,B]=useState(false),[error,E]=useState('');
 if(!open)return <button type="button" className="ep-btn secondary sm" onClick={()=>O(true)}>Change password</button>;
 return <form className="change-password" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),password=String(f.get('password')||''),confirm=String(f.get('confirm')||'');const problem=passwordProblem(password,confirm);if(problem){E(problem);return;}B(true);E('');
   try{const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'password',password,confirm})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Password could not be changed.');window.location.assign(returnTo);}catch(err){E((err as Error).message);B(false);}}}>
  <PasswordField label="New password" name="password" autoComplete="new-password" minLength={12} hint={PASSWORD_HINT}/>
  <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" minLength={12}/>
  <p className="ep-muted" style={{fontSize:13}}>You’ll be signed out on every device and asked to sign in with the new password.</p>
  {error&&<p role="alert" className="ep-notice error">{error}</p>}
  <div className="ep-actions"><button className="ep-btn primary sm" disabled={busy}>{busy?'Saving…':'Save new password'}</button><button type="button" className="ep-btn ghost sm" disabled={busy} onClick={()=>{O(false);E('');}}>Cancel</button></div>
 </form>;
}
