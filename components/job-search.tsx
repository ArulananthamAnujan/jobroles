'use client';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {salaryLabel} from '@/lib/salary';
import {SECTORS} from '@/lib/search';
import {SaveSearch,ReportJob} from './launch-tools';
import SaveJob from './save-job';
import {SiteHeader,SiteFooter} from './site-chrome';
import './job-search.css';
// The home page and /search share one familiar layout: a What/Where bar, filter pills, a result list on the
// left and the selected job on the right. On a phone the list links straight to each job page.
type Job={id:string;title:string;description:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;published_at:string;benefits?:string[];external_apply_url?:string|null;companies:{id:string;name:string;about:string;verified_at:string};job_locations:{label:string}[];distance_km?:number|null;sponsored?:boolean};
type Results={jobs:Job[];total:number;page:number;pageSize:number};
const ARRANGEMENT:Record<string,string>={on_site:'On-site',hybrid:'Hybrid',remote:'Remote'};
export function postedAgo(iso:string,now=Date.now()){const days=Math.floor((now-new Date(iso).getTime())/86400000);return days<=0?'Posted today':days===1?'Posted 1 day ago':days>=30?'Posted 30+ days ago':`Posted ${days} days ago`;}
const pay=(j:Job)=>salaryLabel(j).replace(/^AUD /,'');
const where=(j:Job)=>j.job_locations.map(l=>l.label).join(' · ')||(j.arrangement==='remote'?'Remote':'Australia');
const snippet=(text:string)=>text.split(/\n+/).map(s=>s.trim()).filter(Boolean).slice(0,2).map(s=>s.length>140?`${s.slice(0,137)}…`:s);
const POPULAR=['Registered nurse','Disability support worker','Warehouse','Admin assistant','Chef','Software engineer','Electrician','Customer service'];
const RECENT_KEY='jobroles.recentSearches';
function readRecent():{q:string;near:string}[]{try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');}catch{return [];}}
function rememberSearch(q:string,near:string){if(!q&&!near)return;try{const next=[{q,near},...readRecent().filter(r=>r.q!==q||r.near!==near)].slice(0,5);localStorage.setItem(RECENT_KEY,JSON.stringify(next));}catch{}}
// Recent searches live in this browser only; the snapshot string keeps the store stable between renders.
const EMPTY:{q:string;near:string}[]=[];let cachedRaw='',cached=EMPTY;
function recentSnapshot(){let raw='';try{raw=localStorage.getItem(RECENT_KEY)||'';}catch{}if(raw!==cachedRaw){cachedRaw=raw;cached=raw?readRecent():EMPTY;}return cached;}
function subscribeRecent(cb:()=>void){window.addEventListener('storage',cb);return()=>window.removeEventListener('storage',cb);}


function SearchBar({q,near,compact}:{q:string;near:string;compact:boolean}){
 return <form action="/search" role="search" className={`jr-search ${compact?'compact':''}`} onSubmit={e=>{const f=new FormData(e.currentTarget);rememberSearch(String(f.get('q')||'').trim(),String(f.get('near')||'').trim());}}>
  <label className="jr-field"><span className="jr-field-label">What</span><input name="q" defaultValue={q} maxLength={120} placeholder="Job title, keywords or company" autoComplete="off"/></label>
  <label className="jr-field"><span className="jr-field-label">Where</span><input name="near" defaultValue={near} maxLength={120} placeholder="City, suburb or state" autoComplete="address-level2"/></label>
  <button type="submit" className="jr-primary">Find jobs</button>
 </form>;
}

function Filters({params}:{params:URLSearchParams}){
 const router=useRouter();
 const set=(key:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);next.delete('page');if(key==='salaryMin'&&value)next.set('salaryPeriod','year');router.push(`/search?${next}`);};
 const pill=(key:string,label:string,options:[string,string][],value=params.get(key)||'')=><label className={`jr-pill ${value?'on':''}`}><span className="visually-hidden">{label}</span><select value={value} onChange={e=>set(key,e.target.value)} aria-label={label}><option value="">{label}</option>{options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>;
 return <div className="jr-filters" role="group" aria-label="Filters">
  {pill('salaryMin','Pay',[['50000','$50,000+ a year'],['70000','$70,000+'],['90000','$90,000+'],['110000','$110,000+'],['130000','$130,000+'],['160000','$160,000+']])}
  {pill('arrangement','Remote',[['remote','Remote'],['hybrid','Hybrid'],['on_site','On-site']])}
  {pill('type','Job type',['Full-time','Part-time','Casual','Contract','Temporary','Internship'].map(t=>[t,t] as [string,string]))}
  {pill('posted','Date posted',[['1','Last 24 hours'],['3','Last 3 days'],['7','Last 7 days'],['14','Last 14 days']])}
  {params.get('near')&&pill('radius','Distance',[['5','Within 5 km'],['10','Within 10 km'],['50','Within 50 km'],['100','Within 100 km'],['250','Within 250 km']])}
  {pill('sector','Sector',Object.entries(SECTORS).map(([id,s])=>[id,s.label] as [string,string]))}
  {['salaryMin','arrangement','type','posted','radius','sector','company'].some(k=>params.get(k))&&<Link className="jr-clear" href={`/search?${new URLSearchParams([...params].filter(([k])=>k==='q'||k==='near'))}`}>Clear filters</Link>}
 </div>;
}

// Sponsored jobs are paid per click; the server charges each visitor once a day.
function trackSponsoredClick(id:string){try{if(!navigator.sendBeacon?.(`/api/jobs/${id}/click`))void fetch(`/api/jobs/${id}/click`,{method:'POST',keepalive:true});}catch{}}

function JobCard({job:j,selected,onSelect,query}:{job:Job;selected:boolean;onSelect:()=>void;query:string}){
 const href=`/jobs/${j.id}${query?`?${query}`:''}`;
 return <li className={`jr-card ${selected?'selected':''}`}>
  {j.sponsored&&<p className="jr-sponsored">Sponsored</p>}
  <h2 className="jr-card-title"><a href={href} onClick={e=>{if(j.sponsored)trackSponsoredClick(j.id);if(window.matchMedia('(min-width: 900px)').matches){e.preventDefault();onSelect();}}} aria-current={selected||undefined}>{j.title}</a></h2>
  <p className="jr-company"><Link href={`/companies/${j.companies.id}`}>{j.companies.name}</Link><span className="jr-verified" title="ABN-verified employer">Verified</span></p>
  <p className="jr-location">{where(j)}{typeof j.distance_km==='number'?` · ${j.distance_km} km away`:''}</p>
  <ul className="jr-tags"><li className="jr-pay">{pay(j)}</li><li>{j.employment_type}</li><li>{ARRANGEMENT[j.arrangement]??j.arrangement}</li></ul>
  <ul className="jr-snippet">{snippet(j.description).map((s,i)=><li key={i}>{s}</li>)}</ul>
  <p className="jr-posted">{postedAgo(j.published_at)}</p>
 </li>;
}

function JobPane({job:j,query}:{job:Job;query:string}){
 const apply=j.external_apply_url||`/job-seeker?job=${j.id}#application`;
 return <article className="jr-pane" aria-label={`${j.title} at ${j.companies.name}`}>
  <header className="jr-pane-head">
   <h2>{j.title}</h2>
   <p className="jr-company"><Link href={`/companies/${j.companies.id}`}>{j.companies.name}</Link><span className="jr-verified">Verified employer</span></p>
   <p className="jr-location">{where(j)}</p>
   <p className="jr-pane-pay">{pay(j)} · {j.employment_type}</p>
   <div className="jr-actions">{j.external_apply_url?<a className="jr-primary" href={apply} target="_blank" rel="noopener noreferrer nofollow">Apply on company site</a>:<Link className="jr-primary" href={apply}>Apply now</Link>}<SaveJob key={j.id} id={j.id}/><Link className="jr-secondary" href={`/jobs/${j.id}${query?`?${query}`:''}`}>Open job page</Link></div>
  </header>
  <div className="jr-pane-body">
   <section><h3>Job details</h3><dl className="jr-details"><div><dt>Pay</dt><dd>{pay(j)}</dd></div><div><dt>Job type</dt><dd>{j.employment_type}</dd></div><div><dt>Work setting</dt><dd>{ARRANGEMENT[j.arrangement]??j.arrangement}</dd></div><div><dt>Location</dt><dd>{where(j)}</dd></div></dl></section>
   {j.benefits&&j.benefits.length>0&&<section><h3>Benefits</h3><ul className="jr-tags">{j.benefits.map(b=><li key={b}>{b}</li>)}</ul></section>}
   <section><h3>Full job description</h3><p className="job-description">{j.description}</p></section>
   <section><h3>About {j.companies.name}</h3><p>{j.companies.about||'This employer has not added a company introduction yet.'}</p><Link className="text-link" href={`/companies/${j.companies.id}`}>See all jobs and pay at {j.companies.name}</Link></section>
   <p className="jr-private">Your resume is shared only when you submit an application.</p>
   <ReportJob key={j.id} id={j.id}/>
  </div>
 </article>;
}

export default function JobSearch(){
 const path=usePathname(),params=useSearchParams(),query=params.toString(),home=path==='/';
 const router=useRouter(),[tab,T]=useState<'latest'|'foryou'>('latest'),[selected,S]=useState('');
 const recent=useSyncExternalStore(subscribeRecent,recentSnapshot,()=>EMPTY);
 const key=`${home?tab:'search'}|${query}`;
 // One state object per request key: while a new key loads, the previous results stay on screen.
 const [state,setState]=useState<{key:string;results?:Results;error?:string;signIn?:boolean}>({key:''});
 const paneRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const c=new AbortController();
  const url=home&&tab==='foryou'?'/api/recommendations':`/api/jobs?${query}`;
  fetch(url,{signal:c.signal,cache:'no-store'}).then(async res=>{
   if(res.status===401){setState({key,signIn:true,results:{jobs:[],total:0,page:1,pageSize:20}});return;}
   const d=await res.json() as Partial<Results>&{error?:string};if(!res.ok)throw new Error(d.error||'Unable to load jobs.');
   const jobs=d.jobs||[];setState({key,results:{jobs,total:d.total??jobs.length,page:d.page??1,pageSize:d.pageSize??20}});S(jobs[0]?.id||'');
  }).catch(e=>{if(e.name!=='AbortError')setState({key,error:(e as Error).message});});
  return()=>c.abort();
 },[key,query,home,tab]);
 const loading=state.key!==key,results=state.results,error=state.error,signIn=Boolean(state.signIn)&&!loading;
 const chosen=useMemo(()=>results?.jobs.find(j=>j.id===selected),[results,selected]);
 const pageHref=(page:number)=>{const next=new URLSearchParams(query);next.set('page',String(page));return `/search?${next}`;};
 const q=params.get('q')||'',near=params.get('near')||params.get('location')||'';
 const heading=home?(tab==='foryou'?'Jobs for you':'Latest jobs with the pay shown'):`${results?.total??''} ${q?`${q} jobs`:'jobs'}${near?` near ${near}`:''}`.trim();
 return <div className="jr">
  <a className="skip-link" href="#results">Skip to results</a>
  <SiteHeader/>
  <div className={`jr-hero ${home?'home':''}`}>
   {home&&<h1 className="jr-home-title">Find a job in Australia, with the pay shown</h1>}
   <SearchBar q={q} near={near} compact={!home}/>
   {home?<div className="jr-under">
    {recent.length>0&&<p className="jr-chips"><span>Recent searches:</span>{recent.map(r=><Link key={`${r.q}|${r.near}`} href={`/search?${new URLSearchParams(Object.entries({q:r.q,near:r.near}).filter(([,v])=>v))}`}>{[r.q,r.near].filter(Boolean).join(' · ')}</Link>)}</p>}
    <p className="jr-chips"><span>Popular:</span>{POPULAR.map(p=><Link key={p} href={`/search?q=${encodeURIComponent(p)}`}>{p}</Link>)}</p>
    <p className="jr-post"><Link href="/employer">Employers: post a job</Link> · every listing shows its pay range and comes from an ABN-verified employer.</p>
   </div>:<Filters params={params}/>}
  </div>
  <main id="results" className="jr-main">
   {home&&<div className="jr-tabs" role="tablist" aria-label="Job feed"><button role="tab" aria-selected={tab==='latest'} onClick={()=>T('latest')}>Latest jobs</button><button role="tab" aria-selected={tab==='foryou'} onClick={()=>T('foryou')}>Jobs for you</button></div>}
   <div className="jr-results-head"><h1 className={home?'jr-feed-title':'jr-results-title'} aria-live="polite">{loading&&!results?'Loading jobs…':heading}</h1>{!home&&results&&<div className="jr-results-tools"><SaveSearch key={query} query={query}/><label className="jr-sort">Sort by <select value={params.get('sort')||''} onChange={e=>{const next=new URLSearchParams(query);if(e.target.value)next.set('sort',e.target.value);else next.delete('sort');next.delete('page');router.push(`/search?${next}`);}}><option value="">relevance</option><option value="newest">date</option><option value="salary">pay</option>{params.get('near')&&<option value="distance">distance</option>}</select></label></div>}</div>
   {error&&<div className="jr-empty" role="alert"><h2>We couldn’t load jobs</h2><p>{error}</p><button className="jr-secondary" onClick={()=>window.location.reload()}>Try again</button></div>}
   {signIn&&<div className="jr-empty"><h2>Sign in to see jobs for you</h2><p>We match roles to the skills, headline and location in your profile.</p><Link className="jr-primary" href="/job-seeker">Sign in</Link></div>}
   {results&&!signIn&&!results.jobs.length&&!error&&<div className="jr-empty"><h2>{home&&tab==='foryou'?'Add skills to your profile to see matches':'No jobs match your search'}</h2><p>{home&&tab==='foryou'?'Your headline, location and skills decide what we suggest.':'Try fewer words, a nearby city, or clear a filter. Save the search to hear when new roles arrive.'}</p>{!home&&<Link className="jr-secondary" href="/search">See all jobs</Link>}</div>}
   {results&&results.jobs.length>0&&<div className="jr-split">
    <ol className="jr-list" aria-label="Job results">{results.jobs.map(j=><JobCard key={j.id} job={j} query={query} selected={selected===j.id} onSelect={()=>{S(j.id);paneRef.current?.scrollTo({top:0});}}/>)}</ol>
    <div className="jr-pane-wrap" ref={paneRef}>{chosen&&<JobPane job={chosen} query={query}/>}</div>
   </div>}
   {results&&!home&&results.total>results.pageSize&&<nav className="jr-pages" aria-label="Results pages">{results.page>1&&<Link className="jr-secondary" href={pageHref(results.page-1)}>Previous</Link>}<span>Page {results.page} of {Math.ceil(results.total/results.pageSize)}</span>{results.page*results.pageSize<results.total&&<Link className="jr-secondary" href={pageHref(results.page+1)}>Next</Link>}</nav>}
   {home&&results&&tab==='latest'&&results.total>results.jobs.length&&<p className="jr-more"><Link className="jr-secondary" href="/search">See all {results.total} jobs</Link></p>}
  </main>
  {home&&<section className="jr-browse" aria-labelledby="browse-title"><h2 id="browse-title">Browse jobs</h2><div className="jr-browse-cols"><div><h3>By city</h3><ul>{['Melbourne','Sydney','Brisbane','Perth','Adelaide','Hobart','Canberra','Darwin','Geelong','Newcastle','Gold Coast'].map(c=><li key={c}><Link href={`/search?near=${c}`}>Jobs in {c}</Link></li>)}</ul></div><div><h3>By sector</h3><ul>{Object.entries(SECTORS).map(([id,s])=><li key={id}><Link href={`/search?sector=${id}`}>{s.label}</Link></li>)}</ul></div><div><h3>For employers</h3><ul><li><Link href="/employer">Post a job</Link></li><li><Link href="/employer?view=candidates">Search candidates</Link></li><li><Link href="/market-guide">Salary guides by role</Link></li></ul></div></div></section>}
  <SiteFooter/>
 </div>;
}
