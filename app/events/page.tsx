import type {Metadata} from 'next';
import Link from 'next/link';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
import '@/components/career.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Hiring events: meet employers and get interviewed | JobRoles',description:'Online and in-person hiring events from verified Australian employers. Register free, meet the team and interview on the day.'};
type Ev={id:string;title:string;starts_at:string;ends_at:string;time_zone:string;mode:string;location:string|null;capacity:number|null;registered:number;companies:{id:string;name:string}};
export default async function Events({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams,mode=q.mode==='online'||q.mode==='in_person'?q.mode:'';
 let events:Ev[]=[];
 if(backendConfigured()){let query=publicJobsClient().from('hiring_events').select('id,title,starts_at,ends_at,time_zone,mode,location,capacity,registered,companies(id,name)').is('cancelled_at',null).gt('ends_at',new Date().toISOString()).order('starts_at').limit(100);if(mode)query=query.eq('mode',mode);const {data}=await query;events=(data||[]) as unknown as Ev[];}
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page">
  <section className="cd-hero"><div><h1>Hiring events</h1><p className="muted">Meet employers online or in person, learn about their roles and interview on the day. Registration is free.</p>
   <nav className="co-subtabs" aria-label="Event type">{[['','All events'],['online','Online'],['in_person','In person']].map(([k,l])=><Link key={k} href={k?`/events?mode=${k}`:'/events'} aria-current={mode===k?'page':undefined}>{l}</Link>)}</nav></div></section>
  <div className="co-wrap" style={{marginTop:24}}>{events.length?<ul className="ev-list">{events.map(e=>{const d=new Date(e.starts_at);return <li key={e.id} className="cr-card ev-card">
   <div className="ev-date" aria-hidden="true"><span>{d.toLocaleDateString('en-AU',{month:'short',timeZone:e.time_zone})}</span><span>{d.toLocaleDateString('en-AU',{day:'numeric',timeZone:e.time_zone})}</span></div>
   <div><h2 style={{fontSize:19}}><Link href={`/events/${e.id}`}>{e.title}</Link></h2><p><Link className="text-link" href={`/companies/${e.companies.id}`}>{e.companies.name}</Link></p>
    <p className="muted small">{d.toLocaleString('en-AU',{weekday:'long',hour:'numeric',minute:'2-digit',timeZone:e.time_zone})} {e.time_zone.replace('Australia/','')} time · {e.mode==='online'?'Online':e.location}</p></div>
   <Link className="jp-btn secondary" href={`/events/${e.id}`}>{e.capacity&&e.registered>=e.capacity?'Full':'View and register'}</Link></li>;})}</ul>
   :<div className="cr-card"><h2>No upcoming events</h2><p>Follow companies to hear when they run hiring events, or <Link className="text-link" href="/search">search jobs</Link>.</p></div>}</div>
 </main><SiteFooter/></div>;
}
