'use client';
import {useState} from 'react';
import {Panel,Btn,Field} from './market-ui';
type Candidate={user_id:string;full_name:string;headline:string;location:string;skills:string[];distance_km:number|null};
type Job={id:string;title:string;company_id:string;state:string};
// Verified employers search people who chose to be found, and invite them to apply to a live role.
export default function CandidateSearch({companies,jobs}:{companies:{id:string;name:string}[];jobs:Job[]}){
 const [company,C]=useState(companies[0]?.id||''),[results,R]=useState<Candidate[]|null>(null),[total,T]=useState(0),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[inviting,I]=useState('');
 const live=jobs.filter(j=>j.company_id===company&&j.state==='live');
 if(!companies.length)return null;
 return <section aria-labelledby="candidates-title"><h2 id="candidates-title" className="section-title">Find candidates</h2>
  <p>Search people who have chosen to be found by employers. You see their name, headline, location and skills; they see your invitation in their account and decide whether to apply.</p>
  <Panel><form className="advanced-grid" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');N('');try{const r=await fetch(`/api/candidates?${new URLSearchParams({company,q:String(f.get('q')||''),near:String(f.get('near')||''),radius:String(f.get('radius')||'50')})}`,{cache:'no-store'});const d=await r.json() as {candidates?:Candidate[];total?:number;error?:string};if(!r.ok)throw new Error(d.error);R(d.candidates||[]);T(d.total||0);}catch(err){E((err as Error).message);}finally{B(false);}}}>
   {companies.length>1&&<Field label="Company"><select value={company} onChange={e=>{C(e.target.value);R(null);}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
   <Field label="Skills or role"><input name="q" maxLength={200} placeholder="e.g. triage, forklift licence"/></Field>
   <Field label="Near"><input name="near" maxLength={120} placeholder="e.g. Geelong"/></Field>
   <Field label="Distance"><select name="radius" defaultValue="50">{[10,25,50,100,250].map(r=><option key={r} value={r}>Within {r} km</option>)}</select></Field>
   <Btn disabled={busy}>{busy?'Searching…':'Search candidates'}</Btn></form></Panel>
  {error&&<p role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
  {results&&<p className="section-title" role="status">{total} {total===1?'person':'people'} open to invitations</p>}
  <div className="grid-three">{results?.map(c=><Panel key={c.user_id}><h3>{c.full_name}</h3><p>{c.headline||'No headline'}</p><p className="muted">{c.location||'Location not shared'}{typeof c.distance_km==='number'?` · ${Math.round(c.distance_km)} km away`:''}</p>{c.skills.length>0&&<p>{c.skills.slice(0,8).join(' · ')}</p>}
   {inviting===c.user_id?<form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');N('');try{const r=await fetch('/api/candidates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:f.get('jobId'),seekerId:c.user_id,message:f.get('message')})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);N(`Invitation sent to ${c.full_name}.`);I('');}catch(err){E((err as Error).message);}finally{B(false);}}}>
    <Field label="Role"><select name="jobId" required>{live.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
    <Field label="Message" hint="20 to 1000 characters. Say why this role suits them."><textarea name="message" required minLength={20} maxLength={1000}/></Field>
    <Btn disabled={busy||!live.length}>Send invitation</Btn>{!live.length&&<p>Publish a role first to invite people to it.</p>}</form>
   :<Btn secondary onClick={()=>I(c.user_id)}>Invite to apply</Btn>}</Panel>)}</div>
 </section>;
}
