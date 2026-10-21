'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Panel,Btn} from './market-ui';
type Saved={job_id:string;created_at:string;jobs:null|{id:string;title:string;state:string;expires_at:string;companies:null|{name:string}}};
export default function SavedJobs(){
 const [rows,R]=useState<Saved[]>([]),[page,P]=useState(1),[total,T]=useState(0),[error,E]=useState(''),[busy,B]=useState(false),[revision,V]=useState(0);
 useEffect(()=>{const c=new AbortController();B(true);E('');fetch(`/api/saved?page=${page}`,{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {saved:Saved[];total:number;error?:string};if(!r.ok)throw new Error(d.error);R(d.saved);T(d.total);}).catch(e=>{if(e.name!=='AbortError')E(e.message);}).finally(()=>{if(!c.signal.aborted)B(false);});return()=>c.abort();},[page,revision]);
 async function remove(id:string){B(true);E('');try{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saved.toggle',payload:{jobId:id,saved:false}})});if(!r.ok)throw new Error('Could not remove this saved job.');if(rows.length===1&&page>1)P(page-1);else V(v=>v+1);}catch(e){E((e as Error).message);B(false);}}
 return <section id="saved"><h2 className="section-title">Saved jobs</h2>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Updating saved jobs…</p>}<div className="grid-three">{rows.map(r=><Panel key={r.job_id}><h3>{r.jobs?.title||'Job no longer available'}</h3><p>{r.jobs?.companies?.name}</p>{r.jobs?.state==='live'&&new Date(r.jobs.expires_at)>new Date()?<Link className="text-link" href={`/jobs/${r.job_id}`}>View job</Link>:<p>This role is closed or no longer listed.</p>}<Btn secondary disabled={busy} onClick={()=>remove(r.job_id)}>Remove saved job</Btn></Panel>)}</div>{!rows.length&&!busy&&!error&&<p>Save roles from search to return to them here.</p>}<div className="toolbar">{page>1&&<Btn secondary disabled={busy} onClick={()=>P(page-1)}>Previous saved jobs</Btn>}{page*20<total&&<Btn secondary disabled={busy} onClick={()=>P(page+1)}>More saved jobs</Btn>}</div></section>;
}
