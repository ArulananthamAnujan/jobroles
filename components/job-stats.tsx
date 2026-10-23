'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
type Stat={job_id:string;title:string;state:string;views_30d:number;applications:number;apply_rate:number|null;interviewing:number;hired:number;median_days_to_hire:number|null};
// Per-listing funnel for owners and recruiters: views in the last 30 days, applications, interviews and hires.
export default function JobStats({companies}:{companies:{id:string;name:string}[]}){
 const [company,C]=useState(companies[0]?.id||''),[stats,S]=useState<Stat[]|null>(null),[error,E]=useState('');
 useEffect(()=>{if(!company)return;const c=new AbortController();fetch(`/api/job-stats?company=${company}`,{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {stats?:Stat[];error?:string};if(!r.ok)throw new Error(d.error);S(d.stats||[]);E('');}).catch(e=>{if(e.name!=='AbortError'){E(e.message);S(null);}});return()=>c.abort();},[company]);
 async function sponsor(jobId:string){E('');try{const r=await fetch('/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId})});const d=await r.json() as {url?:string;error?:string};if(!r.ok||!d.url)throw new Error(d.error);window.location.assign(d.url);}catch(e){E((e as Error).message||'Checkout is unavailable.');}}
 if(!companies.length)return null;
 return <section aria-labelledby="stats-title"><h2 id="stats-title" className="section-title">Listing performance</h2><p>Sponsoring a live role lifts it in best-match search results and labels it Sponsored. Prices include GST and you receive a tax invoice.</p>
  {companies.length>1&&<label className="field"><span>Company</span><select value={company} onChange={e=>C(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
  {error&&<p role="alert">{error}</p>}
  {stats&&(stats.length?<div className="table-card jr-stats"><table><thead><tr><th>Role</th><th>Status</th><th>Views, 30 days</th><th>Applies</th><th>Apply rate</th><th>Interviews</th><th>Hired</th><th>Days to hire</th><th></th></tr></thead><tbody>{stats.map(s=><tr key={s.job_id}><td><Link className="text-link" href={`/jobs/${s.job_id}`}>{s.title}</Link></td><td>{s.state.replace('_',' ')}</td><td>{s.views_30d}</td><td>{s.applications}</td><td>{s.apply_rate===null?'–':`${s.apply_rate}%`}</td><td>{s.interviewing}</td><td>{s.hired}</td><td>{s.median_days_to_hire??'–'}</td><td>{s.state==='live'?<button className="text-link" onClick={()=>sponsor(s.job_id)}>Sponsor</button>:'–'}</td></tr>)}</tbody></table></div>:<p>No published listings yet.</p>)}
 </section>;
}
