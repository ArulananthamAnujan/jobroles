import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {siteOrigin} from '@/lib/job-posting';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import EventRegister from '@/components/event-register';
import '@/components/job-page.css';
import '@/components/career.css';
export const dynamic='force-dynamic';
type Ev={id:string;title:string;description:string;starts_at:string;ends_at:string;time_zone:string;mode:string;location:string|null;capacity:number|null;registered:number;cancelled_at:string|null;companies:{id:string;name:string};past?:boolean};
const load=cache(async(id:string)=>{if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!backendConfigured())return null;
 const {data}=await publicJobsClient().from('hiring_events').select('id,title,description,starts_at,ends_at,time_zone,mode,location,capacity,registered,cancelled_at,companies(id,name)').eq('id',id).maybeSingle();return data?{...(data as unknown as Ev),past:new Date((data as unknown as Ev).ends_at).getTime()<Date.now()}:null;});
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const e=await load((await params).id);if(!e)return {title:'Event unavailable · JobRoles',robots:{index:false}};
 return {title:`${e.title} · ${e.companies.name} hiring event | JobRoles`,description:e.description.slice(0,280),alternates:{canonical:`${siteOrigin()}/events/${e.id}`}};}
export default async function EventPage({params}:{params:Promise<{id:string}>}){
 const e=await load((await params).id);if(!e)notFound();
 const fmt=(iso:string,o:Intl.DateTimeFormatOptions)=>new Date(iso).toLocaleString('en-AU',{...o,timeZone:e.time_zone});
 const ld={'@context':'https://schema.org','@type':'Event',name:e.title,description:e.description,startDate:e.starts_at,endDate:e.ends_at,eventStatus:e.cancelled_at?'https://schema.org/EventCancelled':'https://schema.org/EventScheduled',
  eventAttendanceMode:e.mode==='online'?'https://schema.org/OnlineEventAttendanceMode':'https://schema.org/OfflineEventAttendanceMode',location:e.mode==='online'?{'@type':'VirtualLocation',url:`${siteOrigin()}/events/${e.id}`}:{'@type':'Place',name:e.location,address:e.location},
  organizer:{'@type':'Organization',name:e.companies.name,url:`${siteOrigin()}/companies/${e.companies.id}`},isAccessibleForFree:true};
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page"><div className="co-wrap" style={{marginTop:24,maxWidth:860}}>
  <p><Link className="text-link" href="/events">All hiring events</Link></p>
  <article className="cr-card"><p><Link className="text-link" href={`/companies/${e.companies.id}`}>{e.companies.name}</Link></p><h1>{e.title}</h1>
   {e.cancelled_at?<p className="error">This event was cancelled.</p>:null}
   <dl className="co-facts"><div><dt>When</dt><dd>{fmt(e.starts_at,{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit'})} – {fmt(e.ends_at,{hour:'numeric',minute:'2-digit'})} ({e.time_zone.replace('Australia/','')} time)</dd></div>
    <div><dt>Where</dt><dd>{e.mode==='online'?'Online (link shown after you register)':e.location}</dd></div>{e.capacity&&<div><dt>Places</dt><dd>{Math.max(0,e.capacity-e.registered)} of {e.capacity} left</dd></div>}</dl>
   <p className="preserve">{e.description}</p>
   {!e.cancelled_at&&<EventRegister eventId={e.id} full={Boolean(e.capacity&&e.registered>=e.capacity)} past={Boolean(e.past)}/>}
  </article>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(ld).replace(/</g,'\\u003c')}}/>
 </div></main><SiteFooter/></div>;
}
