'use client';
import {useEffect,useState} from 'react';
// Shows interview times an employer offered, and lets the applicant pick one.
type Proposal={id:string;slots:string[];time_zone:string;format:string;chosen:string|null;cancelled_at:string|null};
const fmt=(iso:string,zone:string)=>new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit',timeZone:zone}).format(new Date(iso));
export default function ProposalPicker({applicationId,onChosen}:{applicationId:string;onChosen?:()=>void}){
 const [items,I]=useState<Proposal[]>([]),[busy,B]=useState(false),[error,E]=useState(''),[done,D]=useState('');
 useEffect(()=>{const c=new AbortController();fetch(`/api/proposals?application=${applicationId}`,{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():{proposals:[]}).then((d:{proposals:Proposal[]})=>I(d.proposals)).catch(()=>{});return()=>c.abort();},[applicationId,done]);
 const open=items.find(p=>!p.chosen&&!p.cancelled_at&&p.slots.some(s=>new Date(s)>new Date()));
 if(!open)return null;
 return <div className="notice" role="region" aria-label="Choose an interview time"><h3>Choose an interview time</h3><p>{open.format} · times shown in {open.time_zone.replace('Australia/','')} time</p>
  <div className="row">{open.slots.filter(s=>new Date(s)>new Date()).map(s=><button key={s} className="jp-btn secondary" disabled={busy} onClick={async()=>{B(true);E('');try{const r=await fetch('/api/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:open.id,slot:s})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);D(`Booked for ${fmt(s,open.time_zone)}. Add it to your calendar below.`);onChosen?.();}catch(e){E((e as Error).message);}finally{B(false);}}}>{fmt(s,open.time_zone)}</button>)}</div>
  {error&&<p role="alert">{error}</p>}{done&&<p role="status">{done}</p>}</div>;
}
