/* eslint-disable @next/next/no-img-element -- employer media is served from Supabase Storage, not the image optimiser */
import type {Metadata} from 'next';
import Link from 'next/link';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {siteOrigin} from '@/lib/job-posting';
import {Mark} from '@/components/market-ui';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
export const dynamic='force-dynamic';
type Row={id:string;name:string;logo_url:string|null;industry:string|null;headquarters:string|null;live_jobs:number;rating:number|null;reviews:number;total_count:number};
const PAGE=24;
export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 const q=(await searchParams).q;
 return {title:'Find great places to work: company reviews and jobs | JobRoles',description:'Browse verified Australian employers with their open jobs, advertised pay and hiring-experience reviews from people who applied.',alternates:{canonical:`${siteOrigin()}/companies`},robots:q?{index:false}:undefined};
}
export default async function Companies({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams;
 const q=typeof query.q==='string'?query.q.slice(0,80):'',page=Math.max(1,Math.min(200,Number(query.page)||1));
 let rows:Row[]=[],error='';
 if(backendConfigured()){const {data,error:e}=await publicJobsClient().rpc('jp_company_directory',{q:q||null,p_offset:(page-1)*PAGE});if(e)error='Companies could not be loaded. Try again shortly.';else rows=(data||[]) as Row[];}
 const total=rows[0]?.total_count??0,pages=Math.ceil(total/PAGE);
 const link=(p:number)=>`/companies?${new URLSearchParams({...(q?{q}:{}),...(p>1?{page:String(p)}:{})})}`;
 return <div className="jp-page"><SiteHeader/>
  <main id="main" className="co-page">
   <section className="cd-hero"><div><h1>Find great places to work</h1><p className="muted">Verified employers with their open jobs, advertised pay and reviews from people who went through their hiring.</p>
    <form className="cd-search" action="/companies" role="search"><input type="search" name="q" defaultValue={q} placeholder="Company name or industry" aria-label="Company name or industry"/><button className="jp-btn">Find companies</button></form>
    {q&&<p className="muted">{total} {total===1?'company matches':'companies match'} “{q}”. <Link className="text-link" href="/companies">Show all</Link></p>}</div></section>
   {error?<p role="alert" className="cd-pager error">{error}</p>:!rows.length?<p className="cd-pager muted">{q?'No companies match that search.':'No verified companies yet.'}</p>:
   <ul className="cd-grid" style={{listStyle:'none'}}>{rows.map(c=><li key={c.id} className="cd-card" style={{margin:0}}>
    <div className="cd-card-top"><span className="cd-logo">{c.logo_url?<img src={c.logo_url} alt=""/>:<Mark initials={c.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}/>}</span>
     <div><h2><Link href={`/companies/${c.id}`}>{c.name}</Link></h2>{c.rating!==null?<p className="small"><strong>{Number(c.rating).toFixed(1)}</strong> ★ · {c.reviews} {Number(c.reviews)===1?'review':'reviews'}</p>:<p className="small muted">No reviews yet</p>}</div></div>
    {(c.industry||c.headquarters)&&<p className="muted small">{[c.industry,c.headquarters].filter(Boolean).join(' · ')}</p>}
    <p className="cd-links"><Link href={`/companies/${c.id}?tab=jobs`}>{c.live_jobs} {Number(c.live_jobs)===1?'job':'jobs'}</Link><Link href={`/companies/${c.id}?tab=reviews`}>Reviews</Link><Link href={`/companies/${c.id}?tab=salaries`}>Salaries</Link></p>
   </li>)}</ul>}
   {pages>1&&<nav className="cd-pager" aria-label="Pages">{page>1&&<Link className="jp-btn secondary" href={link(page-1)}>Previous</Link>}<span className="muted" style={{alignSelf:'center'}}>Page {page} of {pages}</span>{page<pages&&<Link className="jp-btn secondary" href={link(page+1)}>Next</Link>}</nav>}
  </main><SiteFooter/></div>;
}
