/* eslint-disable @next/next/no-img-element -- employer media is served from Supabase Storage, not the image optimiser */
import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {salaryLabel} from '@/lib/salary';
import {payStats,payByTitle} from '@/lib/company';
import {siteOrigin} from '@/lib/job-posting';
import {Mark} from '@/components/market-ui';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
import WriteReview,{HelpfulButton} from '@/components/write-review';
import FollowCompany from '@/components/follow-company';
export const dynamic='force-dynamic';
type Company={id:string;name:string;about:string;verified_at:string;logo_url:string|null;cover_url:string|null;website:string|null;industry:string|null;size_band:string|null;headquarters:string|null;founded_year:number|null;pitch:string|null;benefits:string[]|null;photos:string[]|null};
type Review={id:string;rating:number;title:string;pros:string;cons:string;employer_response:string|null;published_at:string;rating_communication:number|null;rating_fairness:number|null;rating_speed:number|null;helpful_count:number};
type Job={id:string;title:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;published_at:string;benefits:string[]|null;job_locations:{label:string}[]};
type Rating={average:number;count:number;distribution:Record<string,number>;communication:number|null;fairness:number|null;speed:number|null};
type Responsiveness={applications:number;respondedShare:number;medianDays:number|null;interviewShare:number};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TABS=['overview','jobs','reviews','salaries','benefits','photos'] as const;
type Tab=typeof TABS[number];
const SORTS:Record<string,string>={recent:'Most recent',helpful:'Most helpful',high:'Highest rating',low:'Lowest rating'};
const load=cache(async(id:string)=>{
 if(!UUID.test(id)||!backendConfigured())return null;
 const client=publicJobsClient();
 const {data:company,error}=await client.from('companies').select('id,name,about,verified_at,logo_url,cover_url,website,industry,size_band,headquarters,founded_year,pitch,benefits,photos').eq('id',id).maybeSingle();
 if(error)throw error;if(!company)return null;
 const [jobs,{data:responsiveness},{data:rating},{data:reviews}]=await Promise.all([
  client.from('jobs').select('id,title,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,benefits,job_locations(label)').eq('company_id',id).eq('state','live').gt('expires_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(200),
  client.rpc('jp_company_responsiveness',{company:id}),client.rpc('jp_company_rating',{company:id}),
  client.from('company_reviews').select('id,rating,title,pros,cons,employer_response,published_at,rating_communication,rating_fairness,rating_speed,helpful_count').eq('company_id',id).eq('status','published').order('published_at',{ascending:false}).limit(100)]);
 if(jobs.error)throw jobs.error;
 return {company:company as Company,jobs:(jobs.data||[]) as unknown as Job[],responsiveness:responsiveness as Responsiveness|null,rating:rating as Rating|null,reviews:(reviews||[]) as Review[]};
});
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const found=await load((await params).id);if(!found)return {title:'Employer not available · JobRoles',robots:{index:false}};
 const {company,jobs,rating}=found;
 return {title:`${company.name}: jobs, reviews and pay | JobRoles`,description:`${jobs.length} live ${jobs.length===1?'role':'roles'} at ${company.name}${rating?`, rated ${rating.average.toFixed(1)} of 5 by ${rating.count} applicants`:''}. ${company.pitch||company.about}`.slice(0,300),alternates:{canonical:`${siteOrigin()}/companies/${company.id}`},openGraph:company.logo_url?{images:[company.logo_url]}:undefined};
}
const host=(u:string)=>{try{return new URL(u).hostname;}catch{return u;}};
const initials=(name:string)=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const monthYear=(d:string)=>new Date(d).toLocaleDateString('en-AU',{month:'long',year:'numeric'});
function Stars({value,size='md'}:{value:number;size?:'md'|'lg'}){const pct=Math.max(0,Math.min(100,value/5*100));return <span className={`co-starbar ${size}`} role="img" aria-label={`${value.toFixed(1)} out of 5`}><span aria-hidden="true">★★★★★</span><span aria-hidden="true" style={{width:`${pct}%`}}>★★★★★</span></span>;}
function ReviewCard({r,company}:{r:Review;company:string}){
 const cats=([['Communication',r.rating_communication],['Fair process',r.rating_fairness],['Speed',r.rating_speed]] as [string,number|null][]).filter(([,v])=>v);
 return <article className="co-review">
  <div className="co-review-top"><strong className="co-score">{r.rating.toFixed(1)}</strong><Stars value={r.rating}/><span className="muted small">Applicant · {monthYear(r.published_at)}</span></div>
  <h3>{r.title}</h3>
  {cats.length>0&&<p className="co-cats small">{cats.map(([l,v])=><span key={l}>{l} <strong>{v}</strong>/5</span>)}</p>}
  <p><strong>Went well</strong><br/>{r.pros}</p><p><strong>Could be better</strong><br/>{r.cons}</p>
  {r.employer_response&&<p className="co-reply"><strong>Response from {company}</strong><br/>{r.employer_response}</p>}
  <div className="row"><span className="muted small">Was this review helpful?</span><HelpfulButton id={r.id} count={r.helpful_count}/></div>
 </article>;
}
function JobRow({j}:{j:Job}){return <li className="co-job"><div><Link className="co-job-title" href={`/jobs/${j.id}`}>{j.title}</Link><p className="muted">{j.job_locations.map(l=>l.label).join(' · ')} · {j.employment_type} · {j.arrangement.replace('_',' ')}</p></div><p className="co-job-pay">{salaryLabel(j)}</p><p className="muted small">Posted {new Date(j.published_at).toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</p></li>;}
export default async function CompanyPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const [{id},query]=await Promise.all([params,searchParams]);
 const found=await load(id);if(!found)notFound();
 const one=(k:string)=>{const v=query[k];return typeof v==='string'?v:'';};
 const tab:Tab=(TABS as readonly string[]).includes(one('tab'))?one('tab') as Tab:'overview';
 const {company,jobs,responsiveness,rating,reviews}=found;
 const benefits=company.benefits||[],photos=company.photos||[],salaries=payByTitle(jobs),periods=payStats(jobs);
 const jobBenefits=[...jobs.flatMap(j=>j.benefits||[]).reduce((m,b)=>m.set(b,(m.get(b)||0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]);
 const href=(t:Tab,extra:Record<string,string>={})=>{const p=new URLSearchParams(t==='overview'?extra:{tab:t,...extra});const s=p.toString();return `/companies/${company.id}${s?`?${s}`:''}`;};
 const sort=SORTS[one('sort')]?one('sort'):'recent',stars=Number(one('stars'))||0,q=one('q').trim().toLowerCase();
 const shownReviews=reviews.filter(r=>!stars||r.rating===stars).sort((a,b)=>sort==='helpful'?b.helpful_count-a.helpful_count:sort==='high'?b.rating-a.rating:sort==='low'?a.rating-b.rating:b.published_at.localeCompare(a.published_at));
 const shownJobs=q?jobs.filter(j=>`${j.title} ${j.job_locations.map(l=>l.label).join(' ')}`.toLowerCase().includes(q)):jobs;
 const facts=([['Industry',company.industry],['Company size',company.size_band?`${company.size_band.replace(/\d{4,}/g,n=>Number(n).toLocaleString('en-AU')).replace('-','–')} employees`:null],['Headquarters',company.headquarters],['Founded',company.founded_year?String(company.founded_year):null]] as [string,string|null][]).filter(([,v])=>v) as [string,string][];
 const tabs:[Tab,string,number|null][]=[['overview','Overview',null],['jobs','Jobs',jobs.length],['reviews','Reviews',rating?.count??0],['salaries','Salaries',salaries.length],['benefits','Benefits',null],['photos','Photos',photos.length]];
 const summary=rating&&<div className="co-summary">
  <div className="co-summary-score"><strong>{rating.average.toFixed(1)}</strong><Stars value={rating.average} size="lg"/><span className="muted">{rating.count} {rating.count===1?'review':'reviews'} from applicants</span></div>
  <ul className="co-dist" aria-label="Rating breakdown">{['5','4','3','2','1'].map(s=>{const n=rating.distribution?.[s]||0;return <li key={s}><Link href={href('reviews',{stars:s})}>{s} ★</Link><span className="co-bar"><span style={{width:`${rating.count?n/rating.count*100:0}%`}}/></span><span className="muted small">{n}</span></li>;})}</ul>
  {(rating.communication||rating.fairness||rating.speed)&&<dl className="co-catavg">{([['Communication',rating.communication],['Fair process',rating.fairness],['Speed of response',rating.speed]] as [string,number|null][]).filter(([,v])=>v).map(([l,v])=><div key={l}><dt>{l}</dt><dd><strong>{Number(v).toFixed(1)}</strong><Stars value={Number(v)}/></dd></div>)}</dl>}
 </div>;
 const responds=responsiveness&&<section className="co-card"><h2>Hiring insights</h2><p className="muted small">From JobRoles application records over the last six months ({responsiveness.applications} applications).</p>
  <div className="co-insights"><div><strong>{responsiveness.respondedShare}%</strong><span>of applicants got a response</span></div><div><strong>{responsiveness.medianDays!==null?`${responsiveness.medianDays} days`:'–'}</strong><span>typical time to first response</span></div><div><strong>{responsiveness.interviewShare??0}%</strong><span>of applicants reached interview</span></div></div></section>;
 let body;
 if(tab==='jobs')body=<section className="co-card"><div className="co-card-head"><h2>{jobs.length} open {jobs.length===1?'job':'jobs'}</h2><form className="co-filter" action={`/companies/${company.id}`}><input type="hidden" name="tab" value="jobs"/><input type="search" name="q" defaultValue={one('q')} placeholder="Job title or location" aria-label="Filter jobs"/><button className="jp-btn secondary">Filter</button></form></div>
  {shownJobs.length?<ul className="co-jobs">{shownJobs.map(j=><JobRow key={j.id} j={j}/>)}</ul>:<p className="muted">{jobs.length?'No jobs match that filter.':'No open jobs right now.'} <Link className="text-link" href="/search">Search all jobs</Link></p>}</section>;
 else if(tab==='reviews')body=<>
  <section className="co-card"><div className="co-card-head"><h2>Hiring experience reviews</h2><WriteReview companyId={company.id} companyName={company.name}/></div>
   {summary||<p className="muted">No reviews yet. Reviews come only from people who applied here, and each is checked before it appears.</p>}</section>
  {reviews.length>0&&<section className="co-card"><form className="co-filter" action={`/companies/${company.id}`}><input type="hidden" name="tab" value="reviews"/>
   <label className="field"><span>Sort by</span><select name="sort" defaultValue={sort}>{Object.entries(SORTS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label className="field"><span>Rating</span><select name="stars" defaultValue={stars?String(stars):''}><option value="">All ratings</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select></label>
   <button className="jp-btn secondary">Apply</button>{(stars||sort!=='recent')&&<Link className="text-link" href={href('reviews')}>Clear</Link>}</form>
   <p className="muted small">{shownReviews.length} of {reviews.length} reviews</p>
   {shownReviews.length?shownReviews.map(r=><ReviewCard key={r.id} r={r} company={company.name}/>):<p className="muted">No reviews with that rating.</p>}</section>}
 </>;
 else if(tab==='salaries')body=<section className="co-card"><h2>Salaries at {company.name}</h2><p className="muted small">Advertised pay from this employer’s live listings on JobRoles, grouped by job title.</p>
  {salaries.length?<div className="co-table"><table><thead><tr><th>Job title</th><th>Pay range</th><th>Per</th><th>Listings</th></tr></thead><tbody>{salaries.map(s=><tr key={`${s.title}|${s.period}`}><td>{s.title}</td><td><strong>{s.label}</strong></td><td>{s.period}</td><td>{s.count}</td></tr>)}</tbody></table></div>:<p className="muted">No advertised pay yet.</p>}
  {periods.length>0&&<dl className="co-facts">{periods.map(s=><div key={s.period}><dt>All roles paid per {s.period}</dt><dd>{s.label}</dd></div>)}</dl>}</section>;
 else if(tab==='benefits')body=<section className="co-card"><h2>Benefits</h2>
  {benefits.length?<ul className="co-benefits">{benefits.map(b=><li key={b}>{b}</li>)}</ul>:<p className="muted">{company.name} hasn’t listed company-wide benefits yet.</p>}
  {jobBenefits.length>0&&<><h3>Mentioned in current listings</h3><ul className="co-benefits">{jobBenefits.map(([b,n])=><li key={b}>{b} <span className="muted small">· {n} {n===1?'job':'jobs'}</span></li>)}</ul></>}</section>;
 else if(tab==='photos')body=<section className="co-card"><h2>Photos</h2>{photos.length?<div className="co-photos">{photos.map((u,i)=><a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`${company.name} workplace photo ${i+1}`} loading="lazy"/></a>)}</div>:<p className="muted">No photos yet.</p>}</section>;
 else body=<div className="co-overview">
  <div className="co-col">
   <section className="co-card"><h2>About {company.name}</h2>{company.pitch&&<p className="co-pitch">{company.pitch}</p>}<p className="preserve">{company.about||'This employer has not added a company introduction yet.'}</p>
    {facts.length>0&&<dl className="co-facts">{facts.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}{company.website&&<div><dt>Website</dt><dd><a className="text-link" href={company.website} target="_blank" rel="noopener noreferrer nofollow">{host(company.website)}</a></dd></div>}</dl>}</section>
   <section className="co-card"><div className="co-card-head"><h2>Open jobs</h2>{jobs.length>3&&<Link className="text-link" href={href('jobs')}>See all {jobs.length} jobs</Link>}</div>{jobs.length?<ul className="co-jobs">{jobs.slice(0,3).map(j=><JobRow key={j.id} j={j}/>)}</ul>:<p className="muted">No open jobs right now. Follow {company.name} to hear when they post.</p>}</section>
   <section className="co-card"><div className="co-card-head"><h2>Reviews</h2>{reviews.length>2&&<Link className="text-link" href={href('reviews')}>See all {reviews.length} reviews</Link>}</div>{summary||<p className="muted">No reviews yet.</p>}{reviews.slice(0,2).map(r=><ReviewCard key={r.id} r={r} company={company.name}/>)}</section>
  </div>
  <aside className="co-col">
   {responds}
   {benefits.length>0&&<section className="co-card"><div className="co-card-head"><h2>Benefits</h2><Link className="text-link" href={href('benefits')}>See all</Link></div><ul className="co-benefits">{benefits.slice(0,8).map(b=><li key={b}>{b}</li>)}</ul></section>}
   {salaries.length>0&&<section className="co-card"><div className="co-card-head"><h2>Salaries</h2><Link className="text-link" href={href('salaries')}>See all</Link></div><ul className="co-sal">{salaries.slice(0,4).map(s=><li key={`${s.title}|${s.period}`}><span>{s.title}</span><strong>{s.label}<small> /{s.period}</small></strong></li>)}</ul></section>}
   {photos.length>0&&<section className="co-card"><div className="co-card-head"><h2>Photos</h2><Link className="text-link" href={href('photos')}>See all</Link></div><div className="co-photos small">{photos.slice(0,4).map((u,i)=><Link key={u} href={href('photos')}><img src={u} alt={`${company.name} workplace photo ${i+1}`} loading="lazy"/></Link>)}</div></section>}
  </aside>
 </div>;
 return <div className="jp-page"><SiteHeader/>
  <main id="main" className="co-page">
   <div className="co-cover" style={company.cover_url?{backgroundImage:`url(${JSON.stringify(company.cover_url)})`}:undefined}/>
   <div className="co-wrap">
    <header className="co-header">
     <div className="co-logo">{company.logo_url?<img src={company.logo_url} alt={`${company.name} logo`}/>:<Mark initials={initials(company.name)}/>}</div>
     <div className="co-title"><h1>{company.name}</h1>
      <p className="co-meta">{rating?<Link href={href('reviews')} className="co-meta-rating"><strong>{rating.average.toFixed(1)}</strong><Stars value={rating.average}/><span>{rating.count} {rating.count===1?'review':'reviews'}</span></Link>:<span className="muted">No reviews yet</span>}
       <span className="jp-verified">Verified employer since {monthYear(company.verified_at)}</span>{company.industry&&<span className="muted">{company.industry}</span>}{company.headquarters&&<span className="muted">{company.headquarters}</span>}</p></div>
     <div className="co-cta"><FollowCompany companyId={company.id} companyName={company.name}/><WriteReview companyId={company.id} companyName={company.name} secondary/></div>
    </header>
    <nav className="co-tabs" aria-label={`${company.name} sections`}>{tabs.map(([t,l,n])=><Link key={t} href={href(t)} aria-current={tab===t?'page':undefined}>{l}{n!==null&&n>0?<span>{n}</span>:null}</Link>)}</nav>
    {body}
   </div>
  </main><SiteFooter/></div>;
}
