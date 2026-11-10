'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Panel,Btn,Heading} from '@/components/market-ui';
// The token arrives in the URL fragment so it never reaches server logs. It is kept for this tab only,
// so someone who has to sign in first can come back and finish without finding the link again.
const KEY='jr.invite';
function readToken(){const fromLink=location.hash.slice(1);try{if(fromLink)sessionStorage.setItem(KEY,fromLink);return fromLink||sessionStorage.getItem(KEY)||'';}catch{return fromLink;}}
export default function Invite(){
 const [token,T]=useState(''),[message,M]=useState(''),[error,E]=useState(''),[busy,B]=useState(false),[done,D]=useState(false),[email,EM]=useState<string|null|undefined>(undefined);
 useEffect(()=>{const found=readToken();if(location.hash)history.replaceState(null,'','/account/invite');let live=true;Promise.resolve().then(()=>{if(live)T(found);});fetch('/api/account',{cache:'no-store'}).then(r=>r.json()).then((a:{user?:{email:string;confirmed:boolean}|null})=>{if(live)EM(a.user?.confirmed?a.user.email:null);}).catch(()=>{if(live)EM(null);});return()=>{live=false;};},[]);
 async function accept(){B(true);E('');try{const res=await fetch('/api/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'accept',token})});const data=await res.json() as {error?:string};if(!res.ok)throw new Error(data.error||'The invitation could not be accepted.');try{sessionStorage.removeItem(KEY);}catch{}M('Invitation accepted. You now have access to the company’s hiring workspace.');D(true);}catch(e){E((e as Error).message);}finally{B(false);}}
 return <main className="main account-shell"><Heading title="Join your hiring team"/><Panel>
  {done?<><p role="status">{message}</p><Link href="/employer" className="jp-btn">Open the employer portal</Link></>
  :email===undefined?<p role="status">Checking your invitation…</p>
  :!token?<><p>This invitation link is incomplete. Open the full link your colleague sent you, or ask them to create a new one from Team in their employer portal.</p><Link href="/employer" className="text-link">Go to the employer portal</Link></>
  :email?<><p>You are signed in as <strong>{email}</strong>. The invitation only works for the email address it was created for.</p><Btn disabled={busy} onClick={accept}>{busy?'Accepting…':'Accept invitation'}</Btn>{error&&<p role="alert" className="notice error">{error}</p>}</>
  :<><p>Sign in, or create an account, with the email address the company invited. Then come back to this page to accept.</p><Link href="/employer" className="jp-btn">Sign in or create an account</Link><p className="muted">Your invitation is kept in this browser tab while you sign in.</p></>}
 </Panel></main>;
}
