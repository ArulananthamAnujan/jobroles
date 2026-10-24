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
import ReportContent from '@/components/report-content';
import {WorkplaceReview,ShareInterview,AddSalary,AskQuestion,AnswerQuestion} from '@/components/company-contribute';
export const dynamic='force-dynamic';
type Company={id:string;name:string;about:string;verified_at:string;logo_url:string|null;cover_url:string|null;website:string|null;industry:string|null;size_band:string|null;headquarters:string|null;founded_year:number|null;pitch:string|null;benefits:string[]|null;photos:string[]|null};
type Review={id:string;kind:'hiring'|'workplace';job_title:string|null;employment_status:string|null;work_location:string|null;rating_worklife:number|null;rating_pay:number|null;rating_security:number|null;rating_management:number|null;rating_culture:number|null;recommends:boolean|null;rating:number;title:string;pros:string;cons:string;employer_response:string|null;published_at:string;rating_communication:number|null;rating_fairness:number|null;rating_speed:number|null;helpful_count:number};
type Job={id:string;title:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;published_at:string;benefits:string[]|null;job_locations:{label:string}[]};
type Rating={average:number;count:number;distribution:Record<string,number>;communication?:number|null;fairness?:number|null;speed?:number|null;worklife?:number|null;pay?:number|null;security?:number|null;management?:number|null;culture?:number|null;recommend?:number|null};
type Interview={id:string;job_title:string;experience:string;difficulty:number;outcome:string;source:string|null;duration:string|null;process:string;questions:string[];interviewed_on:string|null;published_at:string;helpful_count:number};
type InterviewSummary={count:number;difficulty:number;positive:number;neutral:number;negative:number;offers:number};
type Reported={job_title:string;period:string;reports:number;low:number;median:number;high:number};
type Question={id:string;body:string;published_at:string;company_answers:{id:string;body:string;from_employer:boolean;published_at:string}[]};
type Responsiveness={applications:number;respondedShare:number;medianDays:number|null;interviewShare:number};
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TABS=['overview','jobs','reviews','salaries','interviews','questions','benefits','photos'] as const;
const HIRING_CATS:[keyof Rating,string][]=[['communication','Communication'],['fairness','Fair process'],['speed','Speed of response']];
const WORK_CATS:[keyof Rating,string][]=[['worklife','Work-life balance'],['pay','Pay and benefits'],['security','Job security and advancement'],['management','Management'],['culture','Culture']];
const OUTCOME:Record<string,string>={offer_accepted:'Accepted offer',offer_declined:'Declined offer',no_offer:'No offer',waiting:'Waiting to hear'};
const EXPERIENCE:Record<string,[string,string]>={positive:['Positive experience','teal'],neutral:['Neutral experience','amber'],negative:['Negative experience','red']};
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
  client.from('company_reviews').select('id,kind,job_title,employment_status,work_location,rating_worklife,rating_pay,rating_security,rating_management,rating_culture,recommends,rating,title,pros,cons,employer_response,published_at,rating_communication,rating_fairness,rating_speed,helpful_count').eq('company_id',id).eq('status','published').order('published_at',{ascending:false}).limit(200)]);
 if(jobs.error)throw jobs.error;
 const [{data:workplace},{data:interviews},{data:interviewSummary},{data:reported},{data:questions},{data:events}]=await Promise.all([client.rpc('jp_workplace_rating',{company:id}),
  client.from('company_interviews').select('id,job_title,experience,difficulty,outcome,source,duration,process,questions,interviewed_on,published_at,helpful_count').eq('company_id',id).eq('status','published').order('published_at',{ascending:false}).limit(100),
  client.rpc('jp_interview_summary',{company:id}),client.rpc('jp_company_reported_salaries',{company:id}),
  client.from('company_questions').select('id,body,published_at,company_answers(id,body,from_employer,published_at)').eq('company_id',id).eq('status','published').order('published_at',{ascending:false}).limit(100),
  client.from('hiring_events').select('id,title,starts_at,time_zone,mode,location').eq('company_id',id).is('cancelled_at',null).gt('ends_at',new Date().toISOString()).order('starts_at').limit(5)]);
 return {events:(events||[]) as {id:string;title:string;starts_at:string;time_zone:string;mode:string;location:string|null}[],company:company as Company,jobs:(jobs.data||[]) as unknown as Job[],responsiveness:responsiveness as Responsiveness|null,rating:rating as Rating|null,reviews:(reviews||[]) as Review[],
  workplace:workplace as Rating|null,interviews:(interviews||[]) as Interview[],interviewSummary:interviewSummary as InterviewSummary|null,reported:(reported||[]) as Reported[],questions:(questions||[]) as Question[]};
});
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const found=await load((await params).id);if(!found)return {title:'Employer not available · JobRoles',robots:{index:false}};
 const {company,jobs,rating,workplace}=found,main=workplace||rating;
 return {title:`${company.name}: jobs, reviews, salaries and interviews | JobRoles`,description:`${jobs.length} live ${jobs.length===1?'role':'roles'} at ${company.name}${main?`, rated ${main.average.toFixed(1)} of 5 from ${main.count} reviews`:''}. ${company.pitch||company.about}`.slice(0,300),alternates:{canonical:`${siteOrigin()}/companies/${company.id}`},openGraph:company.logo_url?{images:[company.logo_url]}:undefined};
}
const aud=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:Number(n)<1000?2:0}).format(Number(n));
const host=(u:string)=>{try{return new URL(u).hostname;}catch{return u;}};
const initials=(name:string)=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const monthYear=(d:string)=>new Date(d).toLocaleDateString('en-AU',{month:'long',year:'numeric'});
function Stars({value,size='md'}:{value:number;size?:'md'|'lg'}){const pct=Math.max(0,Math.min(100,value/5*100));return <span className={`co-starbar ${size}`} role="img" aria-label={`${value.toFixed(1)} out of 5`}><span aria-hidden="true">★★★★★</span><span aria-hidden="true" style={{width:`${pct}%`}}>★★★★★</span></span>;}
function ReviewCard({r,company}:{r:Review;company:string}){
 const work=r.kind==='workplace';
 const cats=(work?[['Work-life',r.rating_worklife],['Pay',r.rating_pay],['Security',r.rating_security],['Management',r.rating_management],['Culture',r.rating_culture]]:[['Communication',r.rating_communication],['Fair process',r.rating_fairness],['Speed',r.rating_speed]] as [string,number|null][]).filter(([,v])=>v) as [string,number][];
 const who=work?[r.job_title,r.employment_status==='current'?'Current employee':'Former employee',r.work_location].filter(Boolean).join(' · '):'Applicant';
 return <article className="co-review">
  <div className="co-review-top"><strong className="co-score">{r.rating.toFixed(1)}</strong><Stars value={r.rating}/><span className="muted small">{who} · {monthYear(r.published_at)}</span></div>
  <h3>{r.title}</h3>
  {cats.length>0&&<p className="co-cats small">{cats.map(([l,v])=><span key={l}>{l} <strong>{v}</strong>/5</span>)}{work&&r.recommends!==null&&<span>{r.recommends?'✓ Recommends':'✗ Doesn’t recommend'}</span>}</p>}
  <p><strong>{work?'Pros':'Went well'}</strong><br/>{r.pros}</p><p><strong>{work?'Cons':'Could be better'}</strong><br/>{r.cons}</p>
  {r.employer_response&&<p className="co-reply"><strong>Response from {company}</strong><br/>{r.employer_response}</p>}
  <div className="row"><span className="muted small">Was this review helpful?</span><HelpfulButton id={r.id} count={r.helpful_count}/><ReportContent kind="review" id={r.id}/></div>
 </article>;
}
function InterviewCard({i}:{i:Interview}){
 const [label,tone]=EXPERIENCE[i.experience]||['',''];
 return <article className="co-review">
  <div className="co-review-top"><h3>{i.job_title}</h3><span className="muted small">{i.interviewed_on?`Interviewed ${monthYear(i.interviewed_on)}`:monthYear(i.published_at)}</span></div>
  <p className="co-tags"><span className={`co-tag ${tone}`}>{label}</span><span className="co-tag">Difficulty {i.difficulty}/5</span><span className="co-tag">{OUTCOME[i.outcome]}</span>{i.duration&&<span className="co-tag">Took {i.duration}</span>}</p>
  <p><strong>Process</strong><br/><span className="preserve">{i.process}</span></p>
  {i.questions.length>0&&<div><strong>Interview questions</strong><ul className="co-questions">{i.questions.map(q=><li key={q}>{q}</li>)}</ul></div>}
  <div className="row"><ReportContent kind="interview" id={i.id}/></div>
 </article>;
}
function RatingSummary({rating,cats,who,link}:{rating:Rating;cats:[keyof Rating,string][];who:string;link:(s:string)=>string}){
 const shown=cats.filter(([k])=>rating[k]);
 return <div className="co-summary">
  <div className="co-summary-score"><strong>{rating.average.toFixed(1)}</strong><Stars value={rating.average} size="lg"/><span className="muted">{rating.count} {rating.count===1?'review':'reviews'} {who}</span>{rating.recommend!=null&&<span className="small"><strong>{rating.recommend}%</strong> would recommend</span>}</div>
  <ul className="co-dist" aria-label="Rating breakdown">{['5','4','3','2','1'].map(s=>{const n=rating.distribution?.[s]||0;return <li key={s}><Link href={link(s)}>{s} ★</Link><span className="co-bar"><span style={{width:`${rating.count?n/rating.count*100:0}%`}}/></span><span className="muted small">{n}</span></li>;})}</ul>
  {shown.length>0&&<dl className="co-catavg">{shown.map(([k,l])=><div key={k}><dt>{l}</dt><dd><strong>{Number(rating[k]).toFixed(1)}</strong><Stars value={Number(rating[k])}/></dd></div>)}</dl>}
 </div>;
}
function JobRow({j}:{j:Job}){return <li className="co-job"><div><Link className="co-job-title" href={`/jobs/${j.id}`}>{j.title}</Link><p className="muted">{j.job_locations.map(l=>l.label).join(' · ')} · {j.employment_type} · {j.arrangement.replace('_',' ')}</p></div><p className="co-job-pay">{salaryLabel(j)}</p><p className="muted small">Posted {new Date(j.published_at).toLocaleDateString('en-AU',{day:'numeric',month:'short'})}</p></li>;}
export default async function CompanyPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const [{id},query]=await Promise.all([params,searchParams]);
 const found=await load(id);if(!found)notFound();
 const one=(k:string)=>{const v=query[k];return typeof v==='string'?v:'';};
 const tab:Tab=(TABS as readonly string[]).includes(one('tab'))?one('tab') as Tab:'overview';
 const {company,jobs,responsiveness,rating,workplace,interviews,interviewSummary,reported,questions}=found;
 const type=one('type')==='hiring'||(!found.reviews.some(r=>r.kind==='workplace')&&one('type')!=='workplace')?'hiring':'workplace',reviews=found.reviews.filter(r=>r.kind===type),current=type==='workplace'?workplace:rating,main=workplace||rating;
 const benefits=company.benefits||[],photos=company.photos||[],salaries=payByTitle(jobs),periods=payStats(jobs);
 const jobBenefits=[...jobs.flatMap(j=>j.benefits||[]).reduce((m,b)=>m.set(b,(m.get(b)||0)+1),new Map<string,number>())].sort((a,b)=>b[1]-a[1]);
 const href=(t:Tab,extra:Record<string,string>={})=>{const p=new URLSearchParams(t==='overview'?extra:{tab:t,...extra});const s=p.toString();return `/companies/${company.id}${s?`?${s}`:''}`;};
 const sort=SORTS[one('sort')]?one('sort'):'recent',stars=Number(one('stars'))||0,q=one('q').trim().toLowerCase();
 const shownReviews=reviews.filter(r=>!stars||r.rating===stars).sort((a,b)=>sort==='helpful'?b.helpful_count-a.helpful_count:sort==='high'?b.rating-a.rating:sort==='low'?a.rating-b.rating:b.published_at.localeCompare(a.published_at));
 const shownInterviews=q?interviews.filter(i=>i.job_title.toLowerCase().includes(q)):interviews;
 const shownJobs=q?jobs.filter(j=>`${j.title} ${j.job_locations.map(l=>l.label).join(' ')}`.toLowerCase().includes(q)):jobs;
 const facts=([['Industry',company.industry],['Company size',company.size_band?`${company.size_band.replace(/\d{4,}/g,n=>Number(n).toLocaleString('en-AU')).replace('-','–')} employees`:null],['Headquarters',company.headquarters],['Founded',company.founded_year?String(company.founded_year):null]] as [string,string|null][]).filter(([,v])=>v) as [string,string][];
 const tabs:[Tab,string,number|null][]=[['overview','Overview',null],['jobs','Jobs',jobs.length],['reviews','Reviews',(rating?.count??0)+(workplace?.count??0)],['salaries','Salaries',salaries.length+reported.length],['interviews','Interviews',interviews.length],['questions','Q&A',questions.length],['benefits','Benefits',null],['photos','Photos',photos.length]];
 const summary=(r:Rating|null,t:'hiring'|'workplace')=>r&&<RatingSummary rating={r} cats={t==='hiring'?HIRING_CATS:WORK_CATS} who={t==='hiring'?'from applicants':'from employees'} link={st=>href('reviews',{type:t,stars:st})}/>;
 const interviewBox=interviewSummary&&<div className="co-insights co-insights-row"><div><strong>{interviewSummary.positive}%</strong><span>positive experience</span></div><div><strong>{interviewSummary.difficulty}/5</strong><span>average difficulty</span></div><div><strong>{interviewSummary.offers}%</strong><span>received an offer</span></div></div>;
 const responds=responsiveness&&<section className="co-card"><h2>Hiring insights</h2><p className="muted small">From JobRoles application records over the last six months ({responsiveness.applications} applications).</p>
  <div className="co-insights"><div><strong>{responsiveness.respondedShare}%</strong><span>of applicants got a response</span></div><div><strong>{responsiveness.medianDays!==null?`${responsiveness.medianDays} days`:'–'}</strong><span>typical time to first response</span></div><div><strong>{responsiveness.interviewShare??0}%</strong><span>of applicants reached interview</span></div></div></section>;
 let body;
 if(tab==='jobs')body=<section className="co-card"><div className="co-card-head"><h2>{jobs.length} open {jobs.length===1?'job':'jobs'}</h2><form className="co-filter" action={`/companies/${company.id}`}><input type="hidden" name="tab" value="jobs"/><input type="search" name="q" defaultValue={one('q')} placeholder="Job title or location" aria-label="Filter jobs"/><button className="jp-btn secondary">Filter</button></form></div>
  {shownJobs.length?<ul className="co-jobs">{shownJobs.map(j=><JobRow key={j.id} j={j}/>)}</ul>:<p className="muted">{jobs.length?'No jobs match that filter.':'No open jobs right now.'} <Link className="text-link" href="/search">Search all jobs</Link></p>}</section>;
 else if(tab==='reviews')body=<>
  <section className="co-card"><div className="co-card-head"><h2>{type==='workplace'?`Working at ${company.name}`:'Hiring experience'}</h2>{type==='workplace'?<WorkplaceReview companyId={company.id} companyName={company.name} primary autoOpen={one('write')==='1'}/>:<WriteReview companyId={company.id} companyName={company.name} autoOpen={one('write')==='1'}/>}</div>
   <nav className="co-subtabs" aria-label="Review type"><Link href={href('reviews',{type:'workplace'})} aria-current={type==='workplace'?'page':undefined}>From employees{workplace?` (${workplace.count})`:''}</Link><Link href={href('reviews',{type:'hiring'})} aria-current={type==='hiring'?'page':undefined}>From applicants{rating?` (${rating.count})`:''}</Link></nav>
   {summary(current,type)||<p className="muted">{type==='workplace'?`No reviews from employees yet. If you work or worked at ${company.name}, you can share what it’s like.`:'No reviews from applicants yet. Only people who applied here can review the hiring process.'} Every review is checked before it appears.</p>}</section>
  {reviews.length>0&&<section className="co-card"><form className="co-filter" action={`/companies/${company.id}`}><input type="hidden" name="tab" value="reviews"/><input type="hidden" name="type" value={type}/>
   <label className="field"><span>Sort by</span><select name="sort" defaultValue={sort}>{Object.entries(SORTS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label className="field"><span>Rating</span><select name="stars" defaultValue={stars?String(stars):''}><option value="">All ratings</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select></label>
   <button className="jp-btn secondary">Apply</button>{(stars||sort!=='recent')&&<Link className="text-link" href={href('reviews',{type})}>Clear</Link>}</form>
   <p className="muted small">{shownReviews.length} of {reviews.length} reviews</p>
   {shownReviews.length?shownReviews.map(r=><ReviewCard key={r.id} r={r} company={company.name}/>):<p className="muted">No reviews with that rating.</p>}</section>}
 </>;
 else if(tab==='salaries')body=<>
  <section className="co-card"><div className="co-card-head"><h2>Salaries at {company.name}</h2><AddSalary companyId={company.id} companyName={company.name}/></div>
   <h3>Reported by employees</h3><p className="muted small">Base pay shared anonymously. A job appears once at least three people have reported it.</p>
   {reported.length?<div className="co-table"><table><thead><tr><th>Job title</th><th>Typical pay</th><th>Range</th><th>Per</th><th>Reports</th></tr></thead><tbody>{reported.map(r=><tr key={`${r.job_title}|${r.period}`}><td>{r.job_title}</td><td><strong>{aud(r.median)}</strong></td><td>{aud(r.low)}–{aud(r.high)}</td><td>{r.period}</td><td>{r.reports}</td></tr>)}</tbody></table></div>:<p className="muted">Not enough reports yet.</p>}
  </section>
  <section className="co-card"><h3>Advertised on JobRoles</h3><p className="muted small">Pay ranges from this employer’s live listings, grouped by job title.</p>
   {salaries.length?<div className="co-table"><table><thead><tr><th>Job title</th><th>Pay range</th><th>Per</th><th>Listings</th></tr></thead><tbody>{salaries.map(s=><tr key={`${s.title}|${s.period}`}><td>{s.title}</td><td><strong>{s.label}</strong></td><td>{s.period}</td><td>{s.count}</td></tr>)}</tbody></table></div>:<p className="muted">No advertised pay yet.</p>}
   {periods.length>0&&<dl className="co-facts">{periods.map(s=><div key={s.period}><dt>All roles paid per {s.period}</dt><dd>{s.label}</dd></div>)}</dl>}</section>
 </>;
 else if(tab==='interviews')body=<>
  <section className="co-card"><div className="co-card-head"><h2>Interviews at {company.name}</h2><ShareInterview companyId={company.id} companyName={company.name}/></div>
   {interviewBox||<p className="muted">No interview experiences yet. Share yours to help the next candidate prepare.</p>}</section>
  {interviews.length>0&&<section className="co-card"><form className="co-filter" action={`/companies/${company.id}`}><input type="hidden" name="tab" value="interviews"/><input type="search" name="q" defaultValue={one('q')} placeholder="Job title" aria-label="Filter interviews by job title"/><button className="jp-btn secondary">Filter</button></form>
   <p className="muted small">{shownInterviews.length} of {interviews.length} interviews</p>
   {shownInterviews.length?shownInterviews.map(i=><InterviewCard key={i.id} i={i}/>):<p className="muted">No interviews for that job title.</p>}</section>}
 </>;
 else if(tab==='questions')body=<section className="co-card"><div className="co-card-head"><h2>Questions and answers</h2><AskQuestion companyId={company.id} companyName={company.name}/></div>
  <p className="muted small">Answers come from {company.name} and from people who work or worked there.</p>
  {questions.length?<ul className="co-qa">{questions.map(x=>{const answers=[...x.company_answers].sort((a,b)=>Number(b.from_employer)-Number(a.from_employer));return <li key={x.id}><h3>{x.body}</h3><p className="muted small">Asked {monthYear(x.published_at)} · {answers.length} {answers.length===1?'answer':'answers'}</p>
   {answers.map(a=><div key={a.id} className={a.from_employer?'co-reply':'co-answer'}>{a.from_employer&&<strong>Answer from {company.name}<br/></strong>}{a.body}{!a.from_employer&&<div><ReportContent kind="answer" id={a.id}/></div>}</div>)}<AnswerQuestion questionId={x.id} question={x.body}/></li>;})}</ul>:<p className="muted">No questions yet. Ask about rosters, culture, pay or anything else.</p>}</section>;
 else if(tab==='benefits')body=<section className="co-card"><h2>Benefits</h2>
  {benefits.length?<ul className="co-benefits">{benefits.map(b=><li key={b}>{b}</li>)}</ul>:<p className="muted">{company.name} hasn’t listed company-wide benefits yet.</p>}
  {jobBenefits.length>0&&<><h3>Mentioned in current listings</h3><ul className="co-benefits">{jobBenefits.map(([b,n])=><li key={b}>{b} <span className="muted small">· {n} {n===1?'job':'jobs'}</span></li>)}</ul></>}</section>;
 else if(tab==='photos')body=<section className="co-card"><h2>Photos</h2>{photos.length?<div className="co-photos">{photos.map((u,i)=><a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`${company.name} workplace photo ${i+1}`} loading="lazy"/></a>)}</div>:<p className="muted">No photos yet.</p>}</section>;
 else body=<div className="co-overview">
  <div className="co-col">
   <section className="co-card"><h2>About {company.name}</h2>{company.pitch&&<p className="co-pitch">{company.pitch}</p>}<p className="preserve">{company.about||'This employer has not added a company introduction yet.'}</p>
    {facts.length>0&&<dl className="co-facts">{facts.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}{company.website&&<div><dt>Website</dt><dd><a className="text-link" href={company.website} target="_blank" rel="noopener noreferrer nofollow">{host(company.website)}</a></dd></div>}</dl>}</section>
   <section className="co-card"><div className="co-card-head"><h2>Open jobs</h2>{jobs.length>3&&<Link className="text-link" href={href('jobs')}>See all {jobs.length} jobs</Link>}</div>{jobs.length?<ul className="co-jobs">{jobs.slice(0,3).map(j=><JobRow key={j.id} j={j}/>)}</ul>:<p className="muted">No open jobs right now. Follow {company.name} to hear when they post.</p>}</section>
   <section className="co-card"><div className="co-card-head"><h2>Reviews</h2>{reviews.length>2&&<Link className="text-link" href={href('reviews',{type})}>See all {reviews.length} reviews</Link>}</div>{summary(current,type)||<div className="row"><p className="muted">No reviews yet.</p><WorkplaceReview companyId={company.id} companyName={company.name}/></div>}{reviews.slice(0,2).map(r=><ReviewCard key={r.id} r={r} company={company.name}/>)}</section>
   {questions.length>0&&<section className="co-card"><div className="co-card-head"><h2>Questions and answers</h2><Link className="text-link" href={href('questions')}>See all {questions.length} questions</Link></div><ul className="co-qa">{questions.slice(0,3).map(x=><li key={x.id}><h3>{x.body}</h3><p className="muted small">{x.company_answers.length} {x.company_answers.length===1?'answer':'answers'}</p></li>)}</ul></section>}
  </div>
  <aside className="co-col">
   {found.events.length>0&&<section className="co-card"><h2>Hiring events</h2><ul className="co-sal">{found.events.map(e=><li key={e.id}><Link className="text-link" href={`/events/${e.id}`}>{e.title}</Link><span className="muted small">{new Date(e.starts_at).toLocaleString('en-AU',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:e.time_zone})} · {e.mode==='online'?'Online':e.location}</span></li>)}</ul></section>}
   {responds}
   {interviewSummary&&<section className="co-card"><div className="co-card-head"><h2>Interviews</h2><Link className="text-link" href={href('interviews')}>See all {interviewSummary.count}</Link></div>{interviewBox}</section>}
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
      <p className="co-meta">{main?<Link href={href('reviews')} className="co-meta-rating"><strong>{main.average.toFixed(1)}</strong><Stars value={main.average}/><span>{(workplace?.count??0)+(rating?.count??0)} reviews</span></Link>:<span className="muted">No reviews yet</span>}
       <span className="jp-verified">Verified employer since {monthYear(company.verified_at)}</span>{company.industry&&<span className="muted">{company.industry}</span>}{company.headquarters&&<span className="muted">{company.headquarters}</span>}</p></div>
     <div className="co-cta"><FollowCompany companyId={company.id} companyName={company.name}/><WorkplaceReview companyId={company.id} companyName={company.name}/></div>
    </header>
    <nav className="co-tabs" aria-label={`${company.name} sections`}>{tabs.map(([t,l,n])=><Link key={t} href={href(t)} aria-current={tab===t?'page':undefined}>{l}{n!==null&&n>0?<span>{n}</span>:null}</Link>)}</nav>
    {body}
   </div>
   {main&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'EmployerAggregateRating',itemReviewed:{'@type':'Organization',name:company.name,sameAs:company.website||undefined,logo:company.logo_url||undefined},ratingValue:main.average,ratingCount:main.count,bestRating:5,worstRating:1}).replace(/</g,'\\u003c')}}/>}
  </main><SiteFooter/></div>;
}
