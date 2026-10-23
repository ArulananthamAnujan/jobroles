'use client';
import {useEffect,useMemo,useState} from 'react';
import {employerGet,when} from './api';
import {Button,Drawer,Empty,Notice,Pill,Tabs} from './ui';
import {isVideoInterview} from '@/lib/calendar';
import {Section,type PortalContext} from './portal';
import Candidate from './candidate';
type Interview={interview_id:string;application_id:string;starts_at:string;time_zone:string;format:string;cancelled:boolean;full_name:string;job_title:string};
const dayKey=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne'}).format(new Date(iso));
export default function Interviews({ctx}:{ctx:PortalContext}){
 const [range,R]=useState<'upcoming'|'past'>('upcoming'),[items,I]=useState<Interview[]|null>(null),[open,O]=useState(''),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController();const now=Date.now();const [from,to]=range==='upcoming'?[new Date(now-3600e3),new Date(now+90*864e5)]:[new Date(now-90*864e5),new Date(now)];
  employerGet<{interviews:Interview[]}>('calendar',{company:ctx.company.id,from:from.toISOString(),to:to.toISOString()},c.signal).then(d=>I(range==='past'?d.interviews.reverse():d.interviews)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,range]);
 const days=useMemo(()=>{const m=new Map<string,Interview[]>();for(const i of items||[]){const k=dayKey(i.starts_at);m.set(k,[...(m.get(k)||[]),i]);}return [...m.entries()];},[items]);
 return <Section title="Interviews" sub="Booked interviews across your jobs. Times show in Melbourne time with each interview’s own zone.">
  <Notice error={error}/>
  <Tabs value={range} onChange={v=>{I(null);R(v);}} items={[['upcoming','Upcoming'],['past','Past 90 days']]}/>
  {!items?<p role="status">Loading interviews…</p>:days.length?<div className="ep-cal">{days.map(([day,list])=><section key={day} className="ep-day"><h3>{when(`${day}T12:00:00+10:00`,{weekday:'long',day:'numeric',month:'long'})}</h3>
   {list.map(i=><div key={i.interview_id} className="ep-slot"><time dateTime={i.starts_at}>{when(i.starts_at,{hour:'numeric',minute:'2-digit'})}</time><div className="ep-grow" style={{flex:1}}><strong>{i.full_name}</strong><div className="ep-muted">{i.job_title} · {i.format}{i.time_zone!=='Australia/Melbourne'?` · ${when(i.starts_at,{hour:'numeric',minute:'2-digit',timeZone:i.time_zone})} ${i.time_zone.replace('Australia/','')} time`:''}</div></div>
    {i.cancelled?<Pill tone="red">Cancelled</Pill>:<>{isVideoInterview(i.format)&&<a className="ep-btn primary sm" href={`/interview/${i.interview_id}`}>Join video</a>}<a className="ep-btn ghost sm" href={`/api/interviews/${i.interview_id}`}>Add to calendar</a></>}<Button size="sm" tone="secondary" onClick={()=>O(i.application_id)}>Applicant</Button></div>)}</section>)}</div>
   :<div className="ep-card"><Empty title={range==='upcoming'?'No upcoming interviews':'No interviews in the last 90 days'}>Offer times from an applicant’s profile; they pick one and it appears here.</Empty></div>}
  <Drawer open={Boolean(open)} wide onClose={()=>O('')} title={items?.find(i=>i.application_id===open)?.full_name||'Applicant'}>{open&&<Candidate id={open} ctx={ctx} templates={[]} onChange={()=>{}}/>}</Drawer>
 </Section>;
}
