import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {salaryLabel} from '@/lib/salary';
import {payStats} from '@/lib/company';
import {siteOrigin} from '@/lib/job-posting';
import {Badge,Mark} from '@/components/market-ui';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
export const dynamic='force-dynamic';
type Company={id:string;name:string;about:string;verified_at:string};
type Job={id:string;title:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;published_at:string;job_locations:{label:string}[]};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const load=cache(async(id:string)=>{
 if(!UUID.test(id)||!backendConfigured())return null;
 const client=publicJobsClient();
 const {data:company,error}=await client.from('companies').select('id,name,about,verified_at').eq('id',id).maybeSingle();
 if(error)throw error;if(!company)return null;
 const {data:jobs,error:jobError}=await client.from('jobs').select('id,title,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,job_locations(label)').eq('company_id',id).eq('state','live').gt('expires_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(200);
 if(jobError)throw jobError;
 const {data:responsiveness}=await client.rpc('jp_company_responsiveness',{company:id});
 return {company:company as Company,jobs:(jobs||[]) as unknown as Job[],responsiveness:responsiveness as {applications:number;respondedShare:number;medianDays:number|null}|null};
});
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const found=await load((await params).id);if(!found)return {title:'Employer not available · JobRoles',robots:{index:false}};
 return {title:`${found.company.name}: jobs and pay | JobRoles`,description:`${found.jobs.length} live ${found.jobs.length===1?'role':'roles'} at ${found.company.name}, each with its pay range. ${found.company.about}`.slice(0,300),alternates:{canonical:`${siteOrigin()}/companies/${found.company.id}`}};
}
export default async function CompanyPage({params}:{params:Promise<{id:string}>}){
 const found=await load((await params).id);if(!found)notFound();
 const {company,jobs,responsiveness}=found,stats=payStats(jobs);
 return <div className="jp-page"><SiteHeader/>
  <main id="main" className="jp-main co-main">
   <div className="company-row"><Mark initials={company.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}/><div><h1>{company.name}</h1><Badge>Verified employer since {new Date(company.verified_at).toLocaleDateString('en-AU',{month:'long',year:'numeric'})}</Badge></div></div>
   {responsiveness&&<section className="panel"><h2>How this employer responds</h2><p>Over the last six months, {company.name} acted on {responsiveness.respondedShare}% of {responsiveness.applications} applications{responsiveness.medianDays!==null?`, usually within ${responsiveness.medianDays} days`:''}. Measured from JobRoles application records.</p></section>}
   <section className="panel"><h2>About</h2><p>{company.about||'This employer has not added a company introduction yet.'}</p></section>
   {stats.length>0&&<section className="panel"><h2>Advertised pay on JobRoles</h2><p className="muted">From this employer’s live listings. Ranges are as advertised, grouped by pay period.</p><dl className="job-facts">{stats.map(s=><div key={s.period}><dt>{s.count} {s.count===1?'role':'roles'} paid per {s.period}</dt><dd>{s.label}</dd></div>)}</dl></section>}
   <section><h2 className="section-title">{jobs.length} live {jobs.length===1?'role':'roles'}</h2>{jobs.length?<ul className="company-jobs">{jobs.map(j=><li key={j.id} className="panel"><h3><Link className="job-title" href={`/jobs/${j.id}`}>{j.title}</Link></h3><p>{j.job_locations.map(l=>l.label).join(' · ')} · {j.employment_type} · {j.arrangement.replace('_',' ')}</p><p className="salary-highlight">{salaryLabel(j)}</p></li>)}</ul>:<p>No live roles right now. <Link className="text-link" href="/search">Search all jobs</Link></p>}</section>
  </main><SiteFooter/></div>;
}
