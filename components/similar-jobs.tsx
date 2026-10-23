'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {salaryLabel} from '@/lib/salary';
type Job={id:string;title:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;companies:{name:string};job_locations:{label:string}[]};
// Roles that share words with this title, for people comparing pay before they apply.
export default function SimilarJobs({id,title}:{id:string;title:string}){
 const [jobs,J]=useState<Job[]>([]);
 useEffect(()=>{const words=title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>3).slice(0,4);if(!words.length)return;const c=new AbortController();
  fetch(`/api/jobs?${new URLSearchParams({q:words.join(' or ')})}`,{signal:c.signal}).then(r=>r.ok?r.json():{jobs:[]}).then((d:{jobs:Job[]})=>J(d.jobs.filter(j=>j.id!==id).slice(0,5))).catch(()=>{});return()=>c.abort();},[id,title]);
 return <div className="jp-similar"><h2>Similar jobs</h2>{jobs.length?<ul>{jobs.map(j=><li key={j.id}><Link href={`/jobs/${j.id}`}><strong>{j.title}</strong><span>{j.companies.name} · {j.job_locations.map(l=>l.label).join(', ')||'Remote'}</span><span className="jp-similar-pay">{salaryLabel(j).replace(/^AUD /,'')}</span></Link></li>)}</ul>:<p>No similar roles right now. <Link className="text-link" href="/search">Search all jobs</Link></p>}</div>;
}
