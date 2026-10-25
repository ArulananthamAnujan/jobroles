'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Section} from '../employer/shell';
import {Button,Card,Empty,Notice,Pill} from '../employer/ui';
import {get,post,when} from '../employer/api';
type Saved={job_id:string;created_at:string;jobs:null|{id:string;title:string;state:string;expires_at:string;companies:null|{name:string}}};
type Launch={searches:{id:string;filters:Record<string,string>;frequency?:string}[];reports:{id:string;job_id:string;reason:string;state:string;resolution:string|null}[]};
const FILTER_NAMES:Record<string,string>={on_site:'On-site',hybrid:'Hybrid',remote:'Remote'};
// Saved jobs and the searches that email new roles, as two lists that can be acted on in place.
export default function SavedView(){
 const [saved,S]=useState<Saved[]|null>(null),[total,T]=useState(0),[page,P]=useState(1),[launch,L]=useState<Launch|null>(null),[error,E]=useState(''),[note,N]=useState(''),[version,V]=useState(0),[busy,B]=useState(false);
 useEffect(()=>{const c=new AbortController();get<{saved:Saved[];total:number}>(`/api/saved?page=${page}`,c.signal).then(d=>{S(d.saved);T(d.total);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});
  get<Launch>('/api/launch',c.signal).then(L).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[page,version]);
 async function act(fn:()=>Promise<unknown>,done:string){B(true);E('');N('');try{await fn();N(done);V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 const open=(j:Saved['jobs'])=>j?.state==='live'&&new Date(j.expires_at)>new Date();
 return <Section title="Saved jobs and alerts" sub={`${total} saved ${total===1?'job':'jobs'} · ${launch?.searches.filter(s=>s.frequency&&s.frequency!=='off').length??0} job alerts on`} actions={<Link className="ep-btn primary md" href="/search">Find jobs</Link>}>
  <Notice error={error} message={note}/>
  <div className="ep-over">
   <div className="ep-over-main">
    <Card title="Saved jobs">{!saved?<p className="ep-muted">Loading…</p>:saved.length?<ul className="ep-list">{saved.map(s=><li key={s.job_id}><div className="ep-grow">
      <strong>{open(s.jobs)?<Link href={`/jobs/${s.job_id}`}>{s.jobs?.title}</Link>:s.jobs?.title||'Job no longer available'}</strong>
      <small>{s.jobs?.companies?.name}{s.jobs&&open(s.jobs)?` · closes ${when(s.jobs.expires_at,{day:'numeric',month:'short'})}`:''} · saved {when(s.created_at,{day:'numeric',month:'short'})}</small></div>
      {open(s.jobs)?<Link className="ep-btn secondary sm" href={`/jobs/${s.job_id}`}>View and apply</Link>:<Pill>Closed</Pill>}
      <Button size="sm" tone="ghost" disabled={busy} onClick={()=>act(async()=>{await post('/api/command',{action:'saved.toggle',payload:{jobId:s.job_id,saved:false}});if(saved.length===1&&page>1)P(page-1);},'Removed from saved jobs.')}>Remove</Button></li>)}</ul>
     :<Empty title="No saved jobs" action={<Link className="ep-btn secondary md" href="/search">Search jobs</Link>}>Tap the bookmark on any job to keep it here.</Empty>}
     {total>20&&<div className="ep-actions" style={{justifyContent:'center',padding:'8px 0'}}><Button size="sm" tone="secondary" disabled={page===1} onClick={()=>P(page-1)}>Previous</Button><span className="ep-muted">Page {page}</span><Button size="sm" tone="secondary" disabled={page*20>=total} onClick={()=>P(page+1)}>Next</Button></div>}
    </Card>
   </div>
   <aside className="ep-rail" aria-label="Job alerts">
    <h2>Job alerts<Link href="/alerts">Manage</Link></h2>
    <Card>{!launch?<p className="ep-muted" style={{padding:'12px 0'}}>Loading…</p>:launch.searches.length?<ul className="ep-list">{launch.searches.map(s=>{const rest=Object.entries(s.filters).filter(([k])=>k!=='q').map(([,v])=>FILTER_NAMES[v]??v);return <li key={s.id} style={{flexWrap:'wrap'}}>
      <div className="ep-grow"><strong><Link href={`/search?${new URLSearchParams(s.filters)}`}>{s.filters.q||'All jobs'}</Link></strong><small>{rest.join(' · ')||'Anywhere, any setting'}</small></div>
      <select aria-label={`Emails for ${s.filters.q||'all jobs'}`} value={s.frequency||'off'} disabled={busy} style={{width:'auto',height:30,minHeight:30,fontSize:13}} onChange={e=>act(()=>post('/api/launch',{action:'search.alerts',payload:{id:s.id,frequency:e.target.value}}),'Alert updated.')}>
       <option value="off">No emails</option><option value="daily">Daily</option><option value="instant">Instantly</option></select>
      <Button size="sm" tone="ghost" disabled={busy} aria-label={`Delete ${s.filters.q||'all jobs'} search`} onClick={()=>act(()=>post('/api/launch',{action:'search.delete',payload:{id:s.id}}),'Search deleted.')}>Delete</Button></li>;})}</ul>
     :<Empty title="No job alerts">Search for jobs and choose “Save search” to get new roles by email.</Empty>}</Card>
    {launch&&launch.reports.length>0&&<><h2>Jobs you reported</h2><Card><ul className="ep-list">{launch.reports.map(r=><li key={r.id}><div className="ep-grow"><strong><Link href={`/jobs/${r.job_id}`}>Reported job</Link></strong><small>{r.resolution||r.reason}</small></div><Pill tone={r.state==='open'?'amber':'teal'}>{r.state==='open'?'Under review':'Reviewed'}</Pill></li>)}</ul></Card></>}
   </aside>
  </div>
 </Section>;
}
