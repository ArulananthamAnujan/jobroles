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
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import SimilarJobs from '@/components/similar-jobs';
import '@/components/job-page.css';
import SaveJob from '@/components/save-job';
import {ReportJob} from '@/components/launch-tools';
// Server-rendered so search engines read the full listing and its JobPosting data.
export const dynamic='force-dynamic';
type Job={id:string;company_id:string;title:string;description:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;published_at:string;expires_at:string;benefits:string[];start_date:string|null;external_apply_url:string|null;companies:{id:string;name:string;about:string;verified_at:string};job_locations:{label:string}[]};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const loadJob=cache(async(id:string)=>{
 if(!UUID.test(id)||!backendConfigured())return null;
 const {data,error}=await publicJobsClient().from('jobs').select(jobFields).eq('id',id).eq('state','live').gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error)throw error;return data as unknown as Job|null;
});
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
 const external=job.external_apply_url;
 const apply=external||`/job-seeker?job=${job.id}#application`;
 const ARR:Record<string,string>={on_site:'On-site',hybrid:'Hybrid',remote:'Remote'};
 const date=(d:string)=>new Date(d).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
 return <div className="jp-page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd(jobPostingJsonLd(job,siteOrigin()))}}/>
  <a className="skip-link" href="#main">Skip to content</a>
  <SiteHeader/>
  <main id="main" className="jp-main">
   <p className="jp-back"><Link href="/search">← Back to search</Link></p>
   <div className="jp-grid">
    <article className="jp-article">
     <header className="jp-head">
      <h1>{job.title}</h1>
      <p className="jp-company"><Link href={`/companies/${job.companies.id}`}>{job.companies.name}</Link><span className="jp-verified">ABN-verified employer</span></p>
      <p>{where(job)}</p>
      <p className="jp-pay">{salaryLabel(job).replace(/^AUD /,'')} · {job.employment_type}</p>
      <div className="jp-actions">{external?<a className="jp-apply" href={external} target="_blank" rel="noopener noreferrer nofollow">Apply on company site</a>:<Link className="jp-apply" href={apply}>Apply now</Link>}<SaveJob id={job.id}/></div>
      <p className="jp-note">{external?'You apply on the employer’s own website.':'Your resume is shared only when you submit.'} Posted {date(job.published_at)} · closes {date(job.expires_at)}.</p>
     </header>
     <section><h2>Job details</h2><dl className="jp-details"><div><dt>Pay</dt><dd>{salaryLabel(job).replace(/^AUD /,'')}</dd></div><div><dt>Job type</dt><dd>{job.employment_type}</dd></div><div><dt>Work setting</dt><dd>{ARR[job.arrangement]??job.arrangement}</dd></div><div><dt>Location</dt><dd>{where(job)}</dd></div>{job.start_date&&<div><dt>Start date</dt><dd>{date(job.start_date)}</dd></div>}</dl></section>
     {job.benefits.length>0&&<section><h2>Benefits</h2><ul className="jp-benefits">{job.benefits.map(b=><li key={b}>{b}</li>)}</ul></section>}
     <section><h2>Full job description</h2><p className="job-description">{job.description}</p></section>
     <section><h2>About {job.companies.name}</h2><p>{job.companies.about||'This employer has not added a company introduction yet.'}</p><p><Link className="text-link" href={`/companies/${job.companies.id}`}>See all jobs and pay at {job.companies.name}</Link></p></section>
     <section><ReportJob id={job.id}/></section>
    </article>
    <aside className="jp-aside" aria-label="Similar jobs"><SimilarJobs id={job.id} title={job.title}/></aside>
   </div>
   <div className="jp-sticky">{external?<a className="jp-apply" href={external} target="_blank" rel="noopener noreferrer nofollow">Apply on company site</a>:<Link className="jp-apply" href={apply}>Apply now</Link>}</div>
  </main>
  <SiteFooter/>
 </div>;
}
