import type {Metadata} from 'next';
import Link from 'next/link';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {siteOrigin} from '@/lib/job-posting';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import {AddSalary} from '@/components/company-contribute';
import '@/components/job-page.css';
export const dynamic='force-dynamic';
type Band={period:string;n:number;lo:number;med:number;hi:number};
type Lookup={reported:Band[];advertised:Band[];topPaying:{id:string;name:string;jobs:number;median:number}[]};
const POPULAR=['Registered Nurse','Software Engineer','Accountant','Electrician','Teacher','Disability Support Worker','Project Manager','Warehouse Worker','Chef','Customer Service'];
const ORDER=['year','month','day','hour'];
const aud=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:Number(n)<1000?2:0}).format(Number(n));
const clean=(v:unknown)=>typeof v==='string'?v.trim().slice(0,80):'';
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 const q=await searchParams,title=clean(q.title),place=clean(q.where);
 return {title:title?`${title} salary${place?` in ${place}`:''} in Australia | JobRoles`:'Salaries in Australia: pay by job title | JobRoles',
  description:title?`How much does a ${title} make${place?` in ${place}`:''}? Pay reported by employees and advertised by employers on JobRoles.`:'Search pay by job title and location, from salaries people shared and the pay ranges employers advertise.',
  alternates:{canonical:`${siteOrigin()}/salaries${title?`?title=${encodeURIComponent(title)}`:''}`}};
}
function Bands({rows,label}:{rows:Band[];label:string}){
 const sorted=[...rows].sort((a,b)=>ORDER.indexOf(a.period)-ORDER.indexOf(b.period));
 return <div className="sal-bands">{sorted.map(b=>{const span=Number(b.hi)-Number(b.lo)||1,pos=Math.round((Number(b.med)-Number(b.lo))/span*100);return <div key={b.period} className="sal-band">
  <p className="muted small">{label} · per {b.period} · {b.n} {Number(b.n)===1?'source':'sources'}</p><p className="sal-median">{aud(b.med)}<small> per {b.period}</small></p>
  <div className="sal-range" aria-hidden="true"><span style={{left:`${pos}%`}}/></div><p className="sal-ends small"><span>{aud(b.lo)}</span><span>{aud(b.hi)}</span></p></div>;})}</div>;
}
export default async function Salaries({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams,title=clean(q.title),place=clean(q.where);
 let data:Lookup|null=null,error='';
 if(title&&backendConfigured()){const {data:d,error:e}=await publicJobsClient().rpc('jp_salary_lookup',{title,place:place||null});if(e)error='Salaries could not be loaded. Try again shortly.';else data=d as Lookup;}
 const empty=data&&!data.reported.length&&!data.advertised.length;
 return <div className="jp-page"><SiteHeader/>
  <main id="main" className="co-page">
   <section className="cd-hero"><div><h1>{title?`${title} salary${place?` in ${place}`:''}`:'Find out what you should be paid'}</h1>
    <p className="muted">Pay shared anonymously by employees, alongside the pay ranges employers advertise on JobRoles.</p>
    <form className="cd-search sal-search" action="/salaries" role="search"><input name="title" defaultValue={title} required placeholder="Job title" aria-label="Job title"/><input name="where" defaultValue={place} placeholder="Suburb, city or state (optional)" aria-label="Location"/><button className="jp-btn">Search salaries</button></form></div></section>
   <div className="co-wrap" style={{marginTop:24}}>
    {!title?<section className="co-card"><h2>Popular searches</h2><ul className="co-benefits">{POPULAR.map(p=><li key={p}><Link href={`/salaries?title=${encodeURIComponent(p)}`}>{p}</Link></li>)}</ul><p className="muted small">Looking for national pay benchmarks by sector? See the <Link className="text-link" href="/market-guide">salary guide</Link>.</p></section>
    :error?<p role="alert" className="error">{error}</p>
    :<div className="co-overview"><div className="co-col">
      <section className="co-card"><div className="co-card-head"><h2>Typical pay</h2><AddSalary/></div>
       {data?.reported.length?<Bands rows={data.reported} label="Reported by employees"/>:<p className="muted">Not enough people have shared pay for this job yet. Salaries appear once three people have reported the same job.</p>}
       {data?.advertised.length?<Bands rows={data.advertised} label="Advertised in live jobs"/>:null}
       {empty&&<p className="muted">No pay data for “{title}” yet. Try a broader title, such as “Nurse” rather than “Nurse unit manager”.</p>}</section>
      <section className="co-card"><h2>Jobs for {title}</h2><p>See live roles with the pay shown on every listing.</p><Link className="jp-btn" href={`/search?q=${encodeURIComponent(title)}${place?`&near=${encodeURIComponent(place)}`:''}`}>Search {title} jobs</Link></section>
     </div>
     <aside className="co-col">{data?.topPaying.length?<section className="co-card"><h2>Top-paying employers</h2><p className="muted small">Median advertised yearly pay in live listings.</p><ul className="co-sal">{data.topPaying.map(c=><li key={c.id}><Link className="text-link" href={`/companies/${c.id}?tab=salaries`}>{c.name}</Link><strong>{aud(c.median)}<small> /year · {c.jobs} {Number(c.jobs)===1?'job':'jobs'}</small></strong></li>)}</ul></section>:null}
      <section className="co-card"><h2>How we calculate this</h2><p className="small">Reported pay is base pay before tax that people shared anonymously, shown only once at least three people report the same job. Advertised pay comes from current job listings, which on JobRoles always show a pay range.</p></section></aside>
    </div>}
   </div>
  </main><SiteFooter/></div>;
}
