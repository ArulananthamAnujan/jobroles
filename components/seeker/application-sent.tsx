'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {salaryLabel} from '@/lib/salary';
// What a job seeker sees straight after applying (and on the Apply screen when no job is chosen): a clear
// confirmation, what happens next, and other jobs worth a look, so the page is never a dead end.
type Job={id:string;title:string;employment_type?:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;companies:{name:string};job_locations:{label:string}[];distance_km?:number|null};
export function SuggestedJobs({exclude,heading='Jobs you might also like'}:{exclude?:string;heading?:string}){
 const [jobs,J]=useState<Job[]|null>(null),[matched,M]=useState(true);
 useEffect(()=>{let live=true;
  // Jobs matched to the person's profile first; when there are none yet, the newest jobs on the site.
  fetch('/api/recommendations',{cache:'no-store'}).then(r=>r.ok?r.json():{jobs:[]}).then(async(d:{jobs?:Job[]})=>{let list=(d.jobs||[]).filter(j=>j.id!==exclude);
   if(!list.length){const latest=await fetch('/api/jobs',{cache:'no-store'}).then(r=>r.ok?r.json():{jobs:[]}).catch(()=>({jobs:[]})) as {jobs?:Job[]};list=(latest.jobs||[]).filter(j=>j.id!==exclude);if(live)M(false);}
   if(live)J(list.slice(0,6));}).catch(()=>{if(live)J([]);});return()=>{live=false;};},[exclude]);
 if(!jobs)return <p className="muted" role="status">Finding jobs for you…</p>;
 if(!jobs.length)return <div className="as-none"><p className="muted">There are no other open jobs to suggest right now.</p><Link className="jp-btn secondary" href="/search">Search all jobs</Link></div>;
 return <section aria-labelledby="as-more"><h3 id="as-more">{matched?heading:'Latest jobs on JobRoles'}</h3>
  <ul className="as-jobs">{jobs.map(j=><li key={j.id}><div><Link className="as-title" href={`/jobs/${j.id}`}>{j.title}</Link><p className="muted small">{j.companies?.name}{j.job_locations?.[0]?.label?` · ${j.job_locations[0].label}`:''}{typeof j.distance_km==='number'?` · ${j.distance_km} km away`:''}</p><p className="small">{salaryLabel(j).replace(/^AUD /,'')}</p></div>
   <Link className="jp-btn secondary" href={`/jobs/${j.id}`}>View job</Link></li>)}</ul>
  <p><Link className="text-link" href="/search">Search all jobs</Link></p></section>;
}
export default function ApplicationSent({title,company,jobId}:{title:string;company:string;jobId:string}){
 return <div className="as-sent">
  <div className="as-head" role="status"><span className="as-tick" aria-hidden="true">✓</span><div><h3>Application sent</h3><p>Your application for <strong>{title}</strong>{company?<> at <strong>{company}</strong></>:null} is with the employer, along with your resume and answers.</p></div></div>
  <ol className="as-next"><li><strong>The employer reviews it.</strong> You can see each step (Reviewed, Shortlisted, Interview) under Applications.</li><li><strong>We email you</strong> when they send a message, move your application forward or offer an interview time.</li><li><strong>Keep applying.</strong> Most people apply for several roles before the right one comes through.</li></ol>
  <div className="row"><Link className="jp-btn" href="/job-seeker?view=applications">Track my applications</Link><Link className="jp-btn secondary" href="/search">Find more jobs</Link></div>
  <SuggestedJobs exclude={jobId}/>
 </div>;
}
