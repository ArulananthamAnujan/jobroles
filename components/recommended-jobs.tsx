'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {salaryLabel} from '@/lib/salary';
import {Panel} from './market-ui';
type Job={id:string;title:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;companies:{name:string};job_locations:{label:string}[];distance_km:number|null};
export default function RecommendedJobs(){
 const [jobs,J]=useState<Job[]|null>(null),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController();fetch('/api/recommendations',{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {jobs?:Job[];error?:string};if(!r.ok)throw new Error(d.error);J(d.jobs||[]);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[]);
 return <section aria-labelledby="for-you"><h2 id="for-you" className="section-title">Jobs for you</h2>
  {error&&<p role="alert">{error}</p>}
  {jobs&&!jobs.length&&<p>No new matches right now. Keep your headline, location and skills up to date and we’ll show matching roles here as they’re posted.</p>}
  <div className="grid-three">{jobs?.map(j=><Panel key={j.id}><h3><Link className="job-title" href={`/jobs/${j.id}`}>{j.title}</Link></h3><p>{j.companies.name} · {j.job_locations.map(l=>l.label).join(', ')||'Remote'}{typeof j.distance_km==='number'?` · ${j.distance_km} km away`:''}</p><p className="salary-highlight">{salaryLabel(j)}</p></Panel>)}</div>
 </section>;
}
