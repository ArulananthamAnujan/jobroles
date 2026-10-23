'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {salaryLabel} from '@/lib/salary';
import {Brand} from './market-ui';
import './home-page.css';
type Job={id:string;title:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;companies:{name:string};job_locations:{label:string}[]};
const STATES=['VIC','NSW','QLD','WA','SA','TAS','ACT','NT'];
const STATE_NAMES:Record<string,string>={VIC:'Victoria',NSW:'New South Wales',QLD:'Queensland',WA:'Western Australia',SA:'South Australia',TAS:'Tasmania',ACT:'Australian Capital Territory',NT:'Northern Territory',other:'Remote and other locations'};
const stateOf=(j:Job)=>{for(const l of j.job_locations){const s=l.label.toUpperCase().match(/\b(VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\b/);if(s)return s[1];}return 'other';};
const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0}).format(n);
// Folders in the hero stack: each is a tab that links to its section and lends it its ground.
const folders=[{id:'roles',label:'Live roles by state'},{id:'applying',label:'How applying works'},{id:'employers',label:'For employers'},{id:'city',label:'Search a city'}];

function useEntrances(){useEffect(()=>{const root=document.documentElement;root.classList.add('home-js');const items=[...document.querySelectorAll<HTMLElement>('[data-enter]')];if(!('IntersectionObserver' in window)){items.forEach(i=>i.classList.add('is-in'));return;}const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target);}},{rootMargin:'0px 0px -10% 0px'});items.forEach(i=>io.observe(i));return()=>io.disconnect();},[]);}

function PayFinder(){
 const [min,M]=useState(90000),[count,C]=useState<number|null>(null),[jobs,J]=useState<Job[]|null>(null),[error,E]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{if(timer.current)clearTimeout(timer.current);const c=new AbortController();timer.current=setTimeout(()=>{fetch(`/api/jobs?salaryMin=${min}&salaryPeriod=year&sort=salary`,{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {jobs:Job[];total:number;error?:string};if(!r.ok)throw new Error(d.error||'Job counts are unavailable.');C(d.total);J(d.jobs);E('');}).catch(e=>{if(e.name!=='AbortError')E((e as Error).message);});},220);return()=>c.abort();},[min]);
 const groups=STATES.concat('other').map(s=>({s,items:(jobs||[]).filter(j=>stateOf(j)===s)})).filter(g=>g.items.length);
 return <div className="pay-grid">
  <div className="pay-word-col" data-enter>
   <h2 id="roles-title" className="pay-word" aria-label="Pay: live roles by state">PAY</h2>
   <p className="pay-lede">Every role on JobRoles states its pay range before you apply. Set the least you would take and see which live roles clear it.</p>
   <form className="pay-control" data-ui action="/search" onSubmit={e=>e.preventDefault()}>
    <label htmlFor="pay-min">At least <output htmlFor="pay-min">{money(min)}</output> a year</label>
    <input id="pay-min" type="range" min={40000} max={200000} step={5000} value={min} onChange={e=>M(Number(e.target.value))}/>
    <p className="pay-count" role="status" aria-live="polite">{error?error:count===null?'Counting live roles…':<><strong>{count}</strong> live {count===1?'role pays':'roles pay'} this or more</>}</p>
    <Link className="home-btn" href={`/search?salaryMin=${min}&salaryPeriod=year&sort=salary`}>See these roles</Link>
    <noscript><p>Open the search to filter roles by pay.</p></noscript>
   </form>
  </div>
  <div className="pay-bars" data-ui data-enter>
   {jobs&&!groups.length&&<p className="pay-empty">No live annual-salary roles reach {money(min)} yet. Lower the amount, or <Link href="/search">browse every role</Link>.</p>}
   {groups.map((g,i)=><details key={g.s} className="pay-bar" open={i===0}><summary><span>{STATE_NAMES[g.s]}</span><span className="pay-bar-n">{g.items.length} {g.items.length===1?'role':'roles'}</span></summary><ul>{g.items.map(j=><li key={j.id}><Link href={`/jobs/${j.id}`}><span className="pay-role"><strong>{j.title}</strong><span>{j.companies.name} · {j.job_locations.map(l=>l.label).join(', ')}</span></span><span className="pay-figure">{salaryLabel(j).replace(/^AUD /,'')}</span></Link></li>)}</ul></details>)}
   {!jobs&&!error&&<p className="pay-empty">Loading live roles…</p>}
  </div>
 </div>;
}

const tabs=[
 {id:'post',label:'Post',title:'Write the listing once',body:'Add the role, the locations and the real pay range. The listing assistant can draft or tighten the description and suggest screening questions, and you approve every word.'},
 {id:'review',label:'Review',title:'Read applications in one place',body:'Applicants arrive with the resume version they chose and their screening answers. Move each one through reviewed, shortlisted, interview and offer, with notes your team can see.'},
 {id:'hire',label:'Hire',title:'Talk to people directly',body:'Message applicants and schedule interviews in the same thread. Every change is recorded, so recruiters and hiring managers see the same history.'},
];
function EmployerShowcase(){const [tab,T]=useState(tabs[0]);return <div className="showcase">
 <figure className="listing-plate" data-ui data-enter aria-label="Example of a listing as job seekers see it">
  <div className="plate-head"><span className="plate-mark" aria-hidden="true">HS</span><span><strong>Harbour Software</strong><span className="plate-verified">ABN verified employer</span></span></div>
  <p className="plate-title">Senior Frontend Engineer</p>
  <dl className="plate-facts"><div><dt>Pay</dt><dd>$165,000–$185,000 per year</dd></div><div><dt>Where</dt><dd>Sydney NSW · hybrid</dd></div><div><dt>Type</dt><dd>Full-time</dd></div><div><dt>Question</dt><dd>Are you authorised to work in Australia?</dd></div></dl>
  <span className="plate-apply">Apply now</span>
  <figcaption>An example listing, shown the way job seekers see it.</figcaption>
 </figure>
 <div className="showcase-text" data-enter>
  <div className="showcase-tabs" role="tablist" aria-label="Hiring on JobRoles">{tabs.map(t=><button key={t.id} role="tab" type="button" aria-selected={tab.id===t.id} aria-controls="showcase-panel" onClick={()=>T(t)}>{t.label}</button>)}</div>
  <div id="showcase-panel" role="tabpanel"><h2>Hire with the pay shown</h2><h3>{tab.title}</h3><p>{tab.body}</p></div>
  <div className="showcase-actions"><Link className="cell ink" href="/employer">Post a job</Link><Link className="cell soft" href="/market-guide">Salary guides</Link></div>
 </div>
</div>;}

const CITIES=['Melbourne','Sydney','Brisbane','Perth','Adelaide','Hobart','Canberra','Darwin'];
function CityList(){return <nav className="city-list" data-ui data-enter aria-label="Capital cities"><p>Capital cities</p>{CITIES.map(city=><Link key={city} href={`/search?location=${city}`}><span>{city}</span><span aria-hidden="true">→</span></Link>)}</nav>;}

export default function HomePage(){
 useEntrances();
 const [market,D]=useState<{total:number;recent:number;remote:number}|null>(null);
 useEffect(()=>{const c=new AbortController();fetch('/api/market',{signal:c.signal,cache:'no-store'}).then(async r=>{if(r.ok)D(await r.json());}).catch(()=>{});return()=>c.abort();},[]);
 return <div className="home">
  <a className="skip-link" href="#main">Skip to content</a>
  <header className="home-top"><Brand/><nav aria-label="Main"><Link href="/search">Find jobs</Link><Link href="/market-guide">Sectors & salaries</Link><Link href="/employer">For employers</Link></nav><Link className="home-signin" href="/job-seeker">Sign in</Link></header>
  <main id="main">
   <section className="hero" aria-labelledby="hero-title">
    <div className="hero-words"><h1 id="hero-title">Every job shows its pay</h1><p>JobRoles is an Australian job board. Each listing comes from a verified employer and states its real pay range, and your resume is shared only when you apply.</p></div>
    <div className="folders">
     {folders.map((f,i)=><a key={f.id} className={`folder f${i+1}`} href={`#${f.id}`}><span className="tab">{f.label}</span></a>)}
     <div className="folder front">
      <span className="tab">Search jobs</span>
      <form action="/search" className="hero-search" data-ui role="search">
       <label><span>Job title or keyword</span><input name="q" maxLength={120} placeholder="Registered nurse"/></label>
       <label><span>Where</span><input name="location" maxLength={120} placeholder="City, suburb or state"/></label>
       <button className="home-btn" type="submit">Search jobs</button>
       <p className="hero-more">{market?<><strong>{market.total}</strong> live roles, <strong>{market.recent}</strong> posted this week. </>:null}<Link href="/search">All filters</Link> · <Link href="/search?arrangement=remote">Remote roles</Link></p>
      </form>
     </div>
    </div>
   </section>

   <section id="roles" className="roles" aria-labelledby="roles-title">
    <PayFinder/>
   </section>

   <section id="applying" className="applying" aria-labelledby="applying-title">
    <div className="applying-text" data-enter><h2 id="applying-title">Applying, in order</h2><p>Nothing about you reaches an employer until you press submit. Until then you are browsing, saving and drafting in private.</p><Link className="home-link" href="/job-seeker">Create your account</Link></div>
    <div className="slip" data-enter>
     <h3>Before you apply</h3>
     <p className="slip-row"><span>Read the pay range</span><i aria-hidden="true"/><span>on every listing</span></p>
     <p className="slip-row"><span>Check the employer</span><i aria-hidden="true"/><span>ABN verified</span></p>
     <p className="slip-row"><span>Save the role or the search</span><i aria-hidden="true"/><span>private</span></p>
     <h3>When you apply</h3>
     <p className="slip-row"><span>Choose a resume version</span><i aria-hidden="true"/><span>PDF or DOCX</span></p>
     <p className="slip-row"><span>Answer the screening questions</span><i aria-hidden="true"/><span>yes or no</span></p>
     <p className="slip-row"><span>Your resume is shared</span><i aria-hidden="true"/><span>only now</span></p>
     <h3>After</h3>
     <p className="slip-row"><span>Follow each stage</span><i aria-hidden="true"/><span>in your account</span></p>
     <p className="slip-row"><span>Messages and interviews</span><i aria-hidden="true"/><span>one thread</span></p>
     <p className="slip-total"><span>Withdraw or export your data</span><span>any time</span></p>
    </div>
   </section>

   <section id="employers" className="employers" aria-label="For employers">
    <EmployerShowcase/>
   </section>

   <section id="city" className="city" aria-labelledby="city-title">
    <div className="city-grid">
    <form action="/search" className="city-form" data-enter>
     <h2 id="city-title"><label htmlFor="city-input">Show me work in</label> <input id="city-input" name="location" maxLength={120} placeholder="Geelong" autoComplete="address-level2"/> <button type="submit">now</button></h2>
     <p>Opens every live role in that place, newest first. Add a pay floor or job type on the next page.</p>
    </form>
    <CityList/>
    </div>
   </section>
  </main>

  <footer className="tiles">
   <div className="tile statement"><p>Clear salaries. Private applications.</p><small>© {new Date().getFullYear()} JobRoles. Listing counts cover JobRoles only, not the whole Australian market.</small></div>
   <nav className="tile links" aria-label="Footer"><Link href="/search">Find jobs</Link><Link href="/market-guide">Sectors & salaries</Link><Link href="/employer">For employers</Link><Link href="/job-seeker">Your account</Link></nav>
   <nav className="tile states" aria-label="Jobs by state"><p>Jobs by state</p><div>{STATES.map(s=><Link key={s} href={`/search?location=${s}`}>{s}</Link>)}</div></nav>
   <div className="tile privacy"><p>Your data</p><Link href="/privacy">Export, correct or delete it in Privacy controls</Link></div>
   <div className="tile mark" aria-hidden="true"><span>JobRoles</span></div>
   <Link className="tile invite" href="/employer"><span>Post a role with its pay</span><svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><path d="M10 38 38 10M16 10h22v22" fill="none" stroke="currentColor" strokeWidth="4"/></svg></Link>
  </footer>
 </div>;
}
