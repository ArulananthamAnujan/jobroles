'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {employerGet,employerPost,when,forgetAnswers} from './api';
import {Button,Card,Drawer,Empty,Field,Notice,Pill} from './ui';
import {Section,type PortalContext} from './portal';
type Attendee={name:string|null;email:string;headline:string|null;location:string|null};
type Ev={id:string;title:string;description:string;startsAt:string;endsAt:string;timeZone:string;mode:'online'|'in_person';location:string|null;joinUrl:string|null;capacity:number|null;registered:number;cancelled:boolean;attendees:Attendee[]};
const ZONES=['Australia/Melbourne','Australia/Sydney','Australia/Brisbane','Australia/Adelaide','Australia/Perth','Australia/Hobart','Australia/Darwin'];
// Wall-clock time in an Australian zone to an ISO instant.
function zonedIso(local:string,zone:string){const guess=new Date(`${local}:00Z`);const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(guess);const v=(t:string)=>Number(parts.find(p=>p.type===t)?.value);return new Date(guess.getTime()-(Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'))-guess.getTime())).toISOString();}
function toLocal(iso:string,zone:string){const p=new Intl.DateTimeFormat('en-CA',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(iso));const v=(t:string)=>p.find(x=>x.type===t)?.value;return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;}
// Hiring events: online or in-person open days that job seekers register for.
export default function Events({ctx}:{ctx:PortalContext}){
 const [events,EV]=useState<Ev[]|null>(null),[edit,ED]=useState<Ev|'new'|null>(null),[view,VW]=useState<Ev|null>(null),[mode,M]=useState<'online'|'in_person'>('online'),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false);
 const load=useCallback(async(signal?:AbortSignal)=>{const d=await employerGet<{events:Ev[]}>('events',{company:ctx.company.id},signal);EV(d.events);},[ctx.company.id]);
 useEffect(()=>{const c=new AbortController();Promise.resolve().then(()=>load(c.signal)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[load]);
 // What the Starts and Ends boxes currently hold, read back in words so a mistyped day or year is obvious before saving.
 const [times,TM]=useState<{start:string;end:string}>({start:'',end:''}),[limits,LM]=useState({now:'',max:'',maxEnd:''}),[fresh,FR]=useState('');
 const spoken=(v:string)=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'}).format(d):'';};
 const stamp=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
 function timeProblem(start:string,end:string,isNew:boolean){const s=new Date(start),e=new Date(end),now=Date.now();
  if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime()))return 'Enter the start and end date and time in full.';
  if(isNew&&s.getTime()<now-3600_000)return `The start is in the past (${spoken(start)}). Check the day, month and year.`;
  if(s.getTime()>now+2*365*864e5)return `The start is more than two years away (${spoken(start)}). Check the year.`;
  if(e<=s)return `The event ends (${spoken(end)}) before or when it starts (${spoken(start)}). Check both times.`;
  if(e.getTime()-s.getTime()>14*864e5)return `The event would run for more than two weeks (${spoken(start)} to ${spoken(end)}). Check the dates.`;
  return '';}
 const canRun=(ctx.role==='owner'||ctx.role==='recruiter')&&Boolean(ctx.company.verified_at);
 const open=(e:Ev|'new')=>{ED(e);M(e==='new'?'online':e.mode);E('');const t=Date.now();LM({now:stamp(new Date(t)),max:stamp(new Date(t+2*365*864e5)),maxEnd:stamp(new Date(t+2*365*864e5+14*864e5))});TM(e==='new'?{start:'',end:''}:{start:toLocal(e.startsAt,e.timeZone),end:toLocal(e.endsAt,e.timeZone)});};
 const current=edit&&edit!=='new'?edit:null;
 return <Section title="Hiring events" sub="Run online or in-person open days. Job seekers register on your company page and the events list." actions={canRun&&<Button onClick={()=>open('new')}>Create event</Button>}>
  <Notice error={error} message={note}/>
  {!ctx.company.verified_at&&<p className="ep-muted">Hiring events open once your company is verified.</p>}
  {!events?<p role="status">Loading…</p>:events.length?<div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Event</th><th>When</th><th>Where</th><th className="num">Registered</th><th>Status</th><th/></tr></thead><tbody>
   {events.map(e=><tr key={e.id} className={fresh===e.title?'ep-fresh':undefined}><td><div className="ep-row-title">{e.title}{fresh===e.title&&<span className="ep-saved-tag">Saved just now</span>}</div></td><td>{when(e.startsAt,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:e.timeZone})}</td><td>{e.mode==='online'?'Online':e.location}</td>
    <td className="num">{e.registered}{e.capacity?` / ${e.capacity}`:''}</td><td>{e.cancelled?<Pill tone="red">Cancelled</Pill>:<Pill tone="teal">Open</Pill>}</td>
    <td><div className="ep-row-actions"><Button size="sm" tone="secondary" onClick={()=>VW(e)}>Attendees</Button><Link className="ep-btn ghost sm" href={`/events/${e.id}`}>View</Link>{canRun&&!e.cancelled&&<><Button size="sm" tone="ghost" onClick={()=>open(e)}>Edit</Button>
     <Button size="sm" tone="danger" disabled={busy} onClick={async()=>{if(!confirm('Cancel this event? Registrants will see it as cancelled.'))return;B(true);E('');try{await employerPost({action:'event.cancel',id:e.id});EV(all=>all&&all.map(x=>x.id===e.id?{...x,cancelled:true}:x));N('Event cancelled.');forgetAnswers();await load();}catch(err){E((err as Error).message);}finally{B(false);}}}>Cancel</Button></>}</div></td></tr>)}
  </tbody></table></div>:<Card><Empty title="No hiring events yet" action={canRun&&<Button onClick={()=>open('new')}>Create event</Button>}>Open days and online info sessions help you meet many candidates at once.</Empty></Card>}
  <Drawer open={Boolean(edit)} onClose={()=>ED(null)} title={current?'Edit event':'Create a hiring event'}>{edit&&<form className="ep-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const zone=String(f.get('timeZone'));
    const wrong=timeProblem(String(f.get('start')),String(f.get('end')),!current);if(wrong){E(wrong);return;}
    const title=String(f.get('title')||'').trim(),startsAt=zonedIso(String(f.get('start')),zone);
    // The same event created twice would show twice to job seekers: ask first.
    if(!current&&(events||[]).some(x=>!x.cancelled&&x.title.trim().toLowerCase()===title.toLowerCase()&&new Date(x.startsAt).getTime()===new Date(startsAt).getTime())&&!window.confirm(`You already have an event called “${title}” at that time. Choose OK to create a second one anyway, or Cancel to go back.`))return;
    B(true);E('');
    try{await employerPost({action:'event.save',event:{id:current?.id,companyId:ctx.company.id,title:f.get('title'),description:f.get('description'),startsAt:zonedIso(String(f.get('start')),zone),endsAt:zonedIso(String(f.get('end')),zone),timeZone:zone,mode,
     location:mode==='in_person'?String(f.get('location')||''):undefined,joinUrl:mode==='online'?String(f.get('joinUrl')||''):undefined,capacity:f.get('capacity')?Number(f.get('capacity')):null}});N(current?'Event updated.':'Event created. It now appears on the events page and your company page.');FR(title);ED(null);forgetAnswers();await load();}
    catch(err){E((err as Error).message);}finally{B(false);}}}>
   <Notice error={error}/>
   <Field label="Title" wide><input name="title" required minLength={5} maxLength={140} defaultValue={current?.title} placeholder="e.g. Nursing open day: interviews on the spot"/></Field>
   <Field label="Description" wide><textarea name="description" required minLength={20} maxLength={5000} defaultValue={current?.description} placeholder="Who should come, what to bring, which roles you are hiring for."/></Field>
   <Field label="Starts" hint={spoken(times.start)||'Day, month, year and time'}><input name="start" type="datetime-local" required min={current?undefined:limits.now} max={limits.max} defaultValue={current?toLocal(current.startsAt,current.timeZone):undefined} onChange={e=>TM(t=>({...t,start:e.target.value}))}/></Field>
   <Field label="Ends" hint={spoken(times.end)||'Day, month, year and time'}><input name="end" type="datetime-local" required min={times.start||undefined} max={limits.maxEnd} defaultValue={current?toLocal(current.endsAt,current.timeZone):undefined} onChange={e=>TM(t=>({...t,end:e.target.value}))}/></Field>
   <Field label="Time zone"><select name="timeZone" defaultValue={current?.timeZone||'Australia/Melbourne'}>{ZONES.map(z=><option key={z} value={z}>{z.replace('Australia/','')}</option>)}</select></Field>
   <Field label="Places (optional)"><input name="capacity" type="number" min={1} max={10000} defaultValue={current?.capacity??undefined}/></Field>
   <div className="ep-actions ep-field wide"><label className="ep-check"><input type="radio" checked={mode==='online'} onChange={()=>M('online')}/>Online</label><label className="ep-check"><input type="radio" checked={mode==='in_person'} onChange={()=>M('in_person')}/>In person</label></div>
   {mode==='online'?<Field label="Joining link" hint="Shown only to people who register. Must start with https://" wide><input name="joinUrl" type="url" pattern="https://.*" maxLength={500} defaultValue={current?.joinUrl??undefined}/></Field>
    :<Field label="Address" wide><input name="location" required maxLength={200} defaultValue={current?.location??undefined}/></Field>}
   <div className="ep-actions ep-field wide"><Button disabled={busy}>{busy?'Saving…':current?'Save changes':'Create event'}</Button></div>
  </form>}</Drawer>
  <Drawer open={Boolean(view)} onClose={()=>VW(null)} title={view?.title||'Attendees'}>{view&&(view.attendees.length?<ul className="ep-list">{view.attendees.map(a=><li key={a.email}><div className="ep-grow"><strong>{a.name||a.email}</strong><small>{[a.headline,a.location].filter(Boolean).join(' · ')}</small></div><a className="ep-btn ghost sm" href={`mailto:${a.email}`}>Email</a></li>)}</ul>:<Empty title="No registrations yet">Share the event link from your company page.</Empty>)}</Drawer>
 </Section>;
}
