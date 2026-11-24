'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {Panel,Btn,Field} from '@/components/market-ui';
import {SiteHeader} from '@/components/site-chrome';
import PasswordField,{PASSWORD_HINT,passwordProblem} from '@/components/password-field';
import Captcha,{resetCaptcha} from '@/components/captcha';
import {saveInvite,pendingInvite,forgetInvite} from '@/lib/invite-token';
// Where an emailed team invitation lands. It says who is inviting the person, asks whether they already have an
// account, lets them sign in or create one on the spot, and then accepts the invitation.
// The secret arrives after "#" so it never reaches server logs.
type Invitation={state:'open'|'used'|'cancelled'|'expired'|'unknown';company?:string;role?:string;email?:string};
type Me={email:string;confirmed:boolean}|null;
const ROLE:Record<string,string>={recruiter:'a recruiter',hiring_manager:'a hiring manager'};
const CAN:Record<string,string>={recruiter:'You will be able to post jobs and manage applicants for the jobs you are assigned.',hiring_manager:'You will be able to read applications and add notes on the jobs you are assigned.'};
async function send<T>(path:string,body:unknown):Promise<T>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'Something went wrong. Please try again.');return d;}
export default function Invite(){
 const [token,T]=useState<string|null>(null),[inv,I]=useState<Invitation|null>(null),[me,M]=useState<Me|undefined>(undefined);
 const [step,S]=useState<'ask'|'signin'|'signup'|'sent'>('ask'),[busy,B]=useState(false),[error,E]=useState(''),[done,D]=useState(false);
 const whoAmI=useCallback(async()=>{const a=await fetch('/api/account',{cache:'no-store'}).then(r=>r.json()).catch(()=>({})) as {user?:Me};M(a.user?{email:a.user.email,confirmed:a.user.confirmed}:null);},[]);
 useEffect(()=>{let live=true;
  const fromLink=/^[0-9a-f]{64}$/.test(location.hash.slice(1))?location.hash.slice(1):'';
  if(fromLink)saveInvite(fromLink);if(location.hash)history.replaceState(null,'','/account/invite');
  const found=fromLink||pendingInvite();
  Promise.resolve().then(()=>{if(live)T(found);});
  if(found)send<{invitation:Invitation}>('/api/team',{action:'preview',token:found}).then(d=>{if(live)I(d.invitation);}).catch(()=>{if(live)I({state:'open'});});
  // Opening another invitation link in this same tab only changes what follows "#": start again with it.
  const again=()=>{if(/^#[0-9a-f]{64}$/.test(location.hash))location.reload();};window.addEventListener('hashchange',again);
  void whoAmI();return()=>{live=false;window.removeEventListener('hashchange',again);};},[whoAmI]);
 async function accept(){B(true);E('');try{await send('/api/team',{action:'accept',token});forgetInvite();D(true);}catch(e){E((e as Error).message);}finally{B(false);}}
 async function signOut(){B(true);try{await send('/api/account',{action:'logout'});M(null);S('ask');}catch(e){E((e as Error).message);}finally{B(false);}}
 async function signIn(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');
  try{await send('/api/account',{action:'login',email:f.get('email'),password:f.get('password'),captcha:f.get('captcha')||undefined});await whoAmI();}catch(err){E((err as Error).message);}finally{resetCaptcha();B(false);}}
 async function signUp(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),password=String(f.get('password')||'');
  const problem=passwordProblem(password,String(f.get('confirm')||''));if(problem){E(problem);return;}
  B(true);E('');
  // After confirming their email the person lands on their account, where a reminder brings them back here.
  try{await send('/api/account',{action:'signup',email:f.get('email'),password,confirm:f.get('confirm'),firstName:f.get('firstName'),lastName:f.get('lastName'),captcha:f.get('captcha')||undefined});S('sent');}catch(err){E((err as Error).message);}finally{resetCaptcha();B(false);}}
 const company=inv?.company||'a company',invited=inv?.email||'',mine=me?.email.toLowerCase()||'';
 const problem=error&&<p role="alert" className="notice error">{error}</p>;
 let body;
 if(done)body=<><h1>You’re on the team</h1><p role="status">You now have access to {company}’s hiring workspace.</p><Link href="/employer" className="jp-btn">Open the employer portal</Link></>;
 else if(token===null||me===undefined||(token&&!inv))body=<p role="status">Checking your invitation…</p>;
 else if(!token)body=<><h1>This invitation link is incomplete</h1><p>Open the full link from your invitation email, or ask your colleague to send the invitation again from Team in their employer portal.</p><Link href="/employer" className="text-link">Go to the employer portal</Link></>;
 else if(inv&&inv.state!=='open')body=<><h1>{inv.state==='used'?'This invitation has already been accepted':inv.state==='expired'?'This invitation has expired':inv.state==='cancelled'?'This invitation was cancelled':'We can’t find this invitation'}</h1>
  <p>{inv.state==='used'?'If that was you, sign in to open the employer portal.':'Ask your colleague to send you a new invitation from Team in their employer portal. A newer invitation replaces an older one, so check for a more recent email.'}</p><Link href="/employer" className="jp-btn" onClick={forgetInvite}>Go to the employer portal</Link></>;
 else{
  const intro=<><h1>Join {company}’s hiring team</h1><p><strong>{company}</strong> has invited {invited?<strong>{invited}</strong>:'you'} to join their hiring team on JobRoles{inv?.role&&ROLE[inv.role]?<> as {ROLE[inv.role]}</>:null}.{inv?.role&&CAN[inv.role]?` ${CAN[inv.role]}`:''}</p></>;
  if(me&&me.confirmed&&(!invited||mine===invited.toLowerCase()))body=<>{intro}<p className="muted">You are signed in as {me.email}.</p><div className="row"><Btn disabled={busy} onClick={accept}>{busy?'Accepting…':'Accept invitation'}</Btn></div>{problem}</>;
  else if(me&&me.confirmed)body=<>{intro}<p className="notice">You are signed in as <strong>{me.email}</strong>, but this invitation is for <strong>{invited}</strong>. Sign out, then sign in or create an account with {invited}.</p><div className="row"><Btn disabled={busy} onClick={signOut}>{busy?'Signing out…':`Sign out and continue as ${invited}`}</Btn></div>{problem}</>;
  else if(me&&!me.confirmed||step==='sent')body=<>{intro}<h2>Confirm your email to finish</h2><p role="status">We’ve sent a confirmation email to <strong>{me?.email||invited}</strong>. Open it and choose the button inside. You’ll then see a reminder to accept this invitation.</p><p className="muted">You can close this page. The invitation is remembered in this browser for 7 days.</p><Link className="text-link" href="/account/verify">Didn’t get the email? Send it again</Link></>;
  else if(step==='ask')body=<>{intro}<h2>Do you already have a JobRoles account?</h2><div className="row"><Btn onClick={()=>{E('');S('signin');}}>Yes, sign in</Btn><Btn secondary onClick={()=>{E('');S('signup');}}>No, create my account</Btn></div><p className="muted">Either way, use {invited||'the email address that was invited'}. It takes about a minute.</p></>;
  else if(step==='signin')body=<>{intro}<h2>Sign in to accept</h2><form onSubmit={signIn} className="invite-form">
    <Field label="Email address"><input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={invited} readOnly={Boolean(invited)}/></Field>
    <PasswordField label="Password" name="password" autoComplete="current-password"/>
    <Captcha/><Btn type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</Btn>{problem}</form>
   <p className="row"><Link className="text-link" href="/account/reset">Forgot your password?</Link><button type="button" className="text-link" onClick={()=>{E('');S('signup');}}>I don’t have an account</button></p></>;
  else body=<>{intro}<h2>Create your account</h2><p className="muted">It’s free. We’ll email {invited||'you'} a link to confirm the address, then you can accept the invitation.</p><form onSubmit={signUp} className="invite-form">
    <div className="grid-two"><Field label="First name"><input name="firstName" autoComplete="given-name" required maxLength={80}/></Field><Field label="Last name"><input name="lastName" autoComplete="family-name" required maxLength={80}/></Field></div>
    <Field label="Email address" hint={invited?'The invitation only works for this address.':undefined}><input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={invited} readOnly={Boolean(invited)}/></Field>
    <PasswordField label="Password" name="password" autoComplete="new-password" minLength={12} hint={PASSWORD_HINT}/>
    <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" minLength={12}/>
    <Captcha/><Btn type="submit" disabled={busy}>{busy?'Creating your account…':'Create account'}</Btn>{problem}
    <p className="muted small">By creating an account you agree to our <Link className="text-link" href="/terms">Terms</Link> and <Link className="text-link" href="/privacy">Privacy Policy</Link>.</p></form>
   <p><button type="button" className="text-link" onClick={()=>{E('');S('signin');}}>I already have an account</button></p></>;
 }
 return <><SiteHeader/><main id="main" className="main account-shell invite-page"><Panel>{body}</Panel></main></>;
}
