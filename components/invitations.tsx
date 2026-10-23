'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Panel,Btn} from './market-ui';
type Invite={id:string;job_id:string;message:string;created_at:string;jobs:{title:string;state:string;companies:{name:string}}|null};
export default function Invitations(){
 const [invites,S]=useState<Invite[]>([]),[version,V]=useState(0),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController();fetch('/api/invites',{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {invites?:Invite[];error?:string};if(!r.ok)throw new Error(d.error);S(d.invites||[]);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[version]);
 if(!invites.length&&!error)return null;
 return <section aria-labelledby="invites-title"><h2 id="invites-title" className="section-title">Invitations from employers</h2>{error&&<p role="alert">{error}</p>}
  <div className="grid-three">{invites.map(i=><Panel key={i.id}><h3>{i.jobs?.title||'A role'}</h3><p className="muted">{i.jobs?.companies.name} · {new Date(i.created_at).toLocaleDateString('en-AU')}</p><p style={{whiteSpace:'pre-wrap'}}>{i.message}</p>{i.jobs?.state==='live'?<Link className="text-link" href={`/jobs/${i.job_id}`}>View the role and apply</Link>:<p>This role has closed.</p>}<Btn secondary onClick={async()=>{await fetch('/api/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:i.id})});V(v=>v+1);}}>Dismiss</Btn></Panel>)}</div>
 </section>;
}
