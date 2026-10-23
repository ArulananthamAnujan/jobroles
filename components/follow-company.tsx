'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
// Following saves a daily alert for the company's new roles; signed-out visitors are sent to sign in.
export default function FollowCompany({companyId,companyName}:{companyId:string;companyName:string}){
 const [following,F]=useState<boolean|null>(null),[signedIn,S]=useState(true),[busy,B]=useState(false),[error,E]=useState('');
 useEffect(()=>{let live=true;fetch(`/api/follow?company=${companyId}`).then(async r=>{if(!live)return;if(r.status===401){S(false);F(false);return;}const d=await r.json() as {following?:boolean};F(Boolean(d.following));}).catch(()=>{if(live)F(false);});return()=>{live=false;};},[companyId]);
 if(!signedIn)return <Link className="jp-btn secondary" href="/job-seeker" title="Sign in to follow">Follow</Link>;
 return <span className="co-follow"><button type="button" className={`jp-btn ${following?'':'secondary'}`} aria-pressed={Boolean(following)} disabled={busy||following===null} onClick={async()=>{B(true);E('');try{const r=await fetch('/api/follow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId,follow:!following})});const d=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw new Error(d.error||'Could not update.');F(!following);}catch(err){E((err as Error).message);}finally{B(false);}}}>{following?'Following':'Follow'}</button>
  {error?<small role="alert">{error}</small>:following?<small>We email you new roles at {companyName} daily.</small>:null}</span>;
}
