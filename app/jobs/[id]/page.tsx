import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {headers} from 'next/headers';
import {rateLimit} from '@/lib/backend/guard';
import {publicJobsClient,jobFields} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {salaryLabel} from '@/lib/salary';
import {jobPostingJsonLd,serializeJsonLd,siteOrigin} from '@/lib/job-posting';
import {Brand,Badge,Mark,ActionLink} from '@/components/market-ui';
import SaveJob from '@/components/save-job';
import {ReportJob} from '@/components/launch-tools';
// Server-rendered so search engines read the full listing and its JobPosting data.
export const dynamic='force-dynamic';
type Job={id:string;company_id:string;title:string;description:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;published_at:string;expires_at:string;companies:{id:string;name:string;about:string;verified_at:string};job_locations:{label:string}[]};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const loadJob=cache(async(id:string)=>{
 if(!UUID.test(id)||!backendConfigured())return null;
 const {data,error}=await publicJobsClient().from('jobs').select(jobFields).eq('id',id).eq('state','live').gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error)throw error;return data as unknown as Job|null;
});
const initials=(name:string)=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const where=(j:Job)=>j.job_locations.map(l=>l.label).join(' · ');
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const job=await loadJob((await params).id);
 if(!job)return {title:'Job not available · JobRoles',robots:{index:false}};
 const pay=salaryLabel(job);
 const description=`${job.companies.name} · ${where(job)} · ${pay}. ${job.description.slice(0,140)}`.slice(0,300);
 return {title:`${job.title} · ${job.companies.name} · ${where(job)} | JobRoles`,description,alternates:{canonical:`${siteOrigin()}/jobs/${job.id}`},openGraph:{title:`${job.title} at ${job.companies.name}`,description,type:'website',url:`${siteOrigin()}/jobs/${job.id}`}};
}
// Counts a view for the employer's statistics: one per address per job per hour, never for crawlers.
async function countView(id:string){
 try{const h=await headers();if(/bot|crawl|spider|slurp|preview|monitor/i.test(h.get('user-agent')||''))return;
  const ip=h.get('x-nf-client-connection-ip')||h.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
  rateLimit(`view:${id}:${ip}`,1,60*60_000);await publicJobsClient().rpc('jp_record_job_view',{target:id});}catch{}
}
export default async function JobPage({params}:{params:Promise<{id:string}>}){
 const job=await loadJob((await params).id);
 if(!job)notFound();
 await countView(job.id);
 const apply=`/job-seeker?job=${job.id}#application`;
 return <>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(jobPostingJsonLd(job,siteOrigin()))}}/>
  <a className="skip-link" href="#main">Skip to content</a>
  <header className="topbar"><Brand/><nav className="top-nav"><Link href="/search">Find jobs</Link><Link href="/market-guide">Sectors & salaries</Link><Link href="/employer">For employers</Link></nav><ActionLink secondary href="/job-seeker">Sign in / account</ActionLink></header>
  <main id="main" className="main live-shell">
   <Link className="text-link" href="/search">← Search all jobs</Link>
   <div className="live-detail"><article className="panel">
    <div className="company-row"><Mark initials={initials(job.companies.name)}/><div><Link href={`/companies/${job.companies.id}`}><strong>{job.companies.name}</strong></Link><div><Badge>Verified employer</Badge></div></div></div>
    <h1>{job.title}</h1>
    <dl className="job-facts"><div><dt>Pay</dt><dd className="salary-highlight">{salaryLabel(job)}</dd></div><div><dt>Location</dt><dd>{where(job)}</dd></div><div><dt>Work type</dt><dd>{job.employment_type} · {job.arrangement.replace('_',' ')}</dd></div><div><dt>Posted</dt><dd>{new Date(job.published_at).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}</dd></div><div><dt>Closes</dt><dd>{new Date(job.expires_at).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}</dd></div></dl>
    <ActionLink href={apply}>Apply now</ActionLink><SaveJob id={job.id}/><ReportJob id={job.id}/>
    <p className="muted">Your resume is shared only when you submit.</p>
    <h2>About the role</h2><p className="job-description">{job.description}</p>
    <h2>About {job.companies.name}</h2><p>{job.companies.about||'This employer has not added a company introduction yet.'}</p>
   </article><div className="sticky-apply"><ActionLink href={apply}>Apply now</ActionLink></div></div>
  </main>
  <footer><Brand/><span>Clear salaries. Private applications.</span><Link href="/job-seeker">Your account</Link><Link href="/privacy">Privacy controls</Link><Link href="/terms">Terms</Link></footer>
 </>;
}
