'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Btn} from './market-ui';
// What the signed-in person has done with a job, asked once per job and shared by the Save and Apply buttons.
export type Mine={saved:boolean;application:null|{id:string;state:string}};
const asked=new Map<string,Promise<Mine|null>>();
export function mine(id:string):Promise<Mine|null>{
 let p=asked.get(id);
 if(!p){p=fetch(`/api/jobs/${id}/mine`,{cache:'no-store'}).then(r=>r.ok?r.json() as Promise<Mine>:null).catch(()=>null);asked.set(id,p);}
 return p;
}
export function forgetMine(id:string){asked.delete(id);}
// Save job: the button itself shows the state ("Save job" or "Saved"), so nothing appears underneath and pushes the
// other buttons out of line. Pressing it again removes the job from the saved list.
export default function SaveJob({id}:{id:string}){
 const [saved,S]=useState(false),[busy,B]=useState(false),[problem,P]=useState(''),[login,L]=useState(false);
 useEffect(()=>{let live=true;mine(id).then(m=>{if(live&&m)S(m.saved);});return()=>{live=false;};},[id]);
 async function toggle(){B(true);P('');L(false);const next=!saved;
  try{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saved.toggle',payload:{jobId:id,saved:next}})});
   if(r.status===401){L(true);return;}const d=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw new Error(d.error||'The job could not be saved. Please try again.');
   S(next);forgetMine(id);}catch(e){P((e as Error).message);}finally{B(false);}}
 return <span className="save-job"><Btn secondary type="button" className={saved?'is-saved':''} disabled={busy} aria-pressed={saved} title={saved?'Saved to your account. Press to remove it.':'Keep this job in your saved list'} onClick={()=>void toggle()}>{busy?(saved?'Removing…':'Saving…'):saved?'✓ Saved':'Save job'}</Btn>
  <span className="save-job-note" role="status">{login?<Link className="text-link" href={`/job-seeker?job=${id}`}>Sign in to save this job</Link>:problem}</span></span>;
}
// Apply now, or, once the person has applied, a link to their application instead of inviting them to apply again.
export function ApplyNow({id,href,className}:{id:string;href:string;className:string}){
 const [m,M]=useState<Mine|null>(null);
 useEffect(()=>{let live=true;mine(id).then(x=>{if(live)M(x);});return()=>{live=false;};},[id]);
 const a=m?.application;
 if(a&&a.state==='draft')return <Link className={className} href={href}>Finish my application</Link>;
 if(a)return <Link className={`${className} is-applied`} href={`/account/applications/${a.id}`} title="You have applied for this job. Open your application.">✓ Applied · View application</Link>;
 return <Link className={className} href={href}>Apply now</Link>;
}
