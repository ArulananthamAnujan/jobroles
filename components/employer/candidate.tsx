'use client';
import {useCallback,useEffect,useState} from 'react';
import {get,employerGet,employerPost,command,STAGES,stageLabel,when,ago} from './api';
import {monthLabel} from '@/lib/resume-pdf';
import {Button,Field,Notice,Pill} from './ui';
import type {PortalContext} from './portal';
import {isVideoInterview} from '@/lib/calendar';
type Detail={userId:string;role:string|null;application:{id:string;job_id:string;seeker_id:string;state:string;stage:string;reinstatement_requested_at:string|null;submitted_at?:string};
 job:{title:string;screening_questions:{id:string;question:string;must_have:boolean;expected_answer:string|null}[]}|null;
 snapshot:{profile:{full_name:string;headline:string;location:string;skills:string[];email?:string};resume_version_id:string;answers:Record<string,string>;cover_letter:string}|null;
 history:{id:string;to_state:string;created_at:string}[];notes:{id:string;body:string;rating:number|null;created_at:string}[];
 interviews:{id:string;starts_at:string;time_zone:string;format:string;cancelled_at:string|null}[];messages:{id:string;sender_id:string;body:string;created_at:string}[]};
type Extras={summary:string;experience:{title:string;company:string;location?:string|null;start:string;end?:string|null;description?:string|null}[];education:{qualification:string;institution:string;year?:number|null}[];licences:string[];languages:string[];readyToWork:boolean;availability:string;assessments:{title:string;score:number;level:string;completedAt:string}[]}|null;
const ZONES=['Australia/Melbourne','Australia/Sydney','Australia/Brisbane','Australia/Adelaide','Australia/Perth','Australia/Hobart','Australia/Darwin'];
// Converts a wall-clock time in an Australian zone to an ISO instant, so the stored time is what the interviewer meant.
function zonedIso(local:string,zone:string){const guess=new Date(`${local}:00Z`);const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(guess);const v=(t:string)=>Number(parts.find(p=>p.type===t)?.value);const asZone=Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'));return new Date(guess.getTime()-(asZone-guess.getTime())).toISOString();}
export default function Candidate({id,ctx,templates,onChange}:{id:string;ctx:PortalContext;templates:{id:string;name:string;body:string}[];onChange:()=>void}){
 const [d,D]=useState<Detail|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[message,MS]=useState(''),[mode,MO]=useState<'single'|'propose'>('propose'),[slots,SL]=useState(['','','']),[zone,Z]=useState('Australia/Melbourne');
 const canMove=ctx.role==='owner'||ctx.role==='recruiter';
 const [x,X]=useState<Extras>(null);
 useEffect(()=>{const c=new AbortController();employerGet<{extras:Extras}>('candidate',{application:id},c.signal).then(d=>X(d.extras)).catch(()=>{});return()=>c.abort();},[id]);
 const load=useCallback(async()=>{const x=await get<Detail>(`/api/applications/${id}`);D(x);employerPost({action:'read',applicationId:id}).catch(()=>{});},[id]);
 useEffect(()=>{Promise.resolve().then(load).catch(e=>E((e as Error).message));},[load]);
 async function act(fn:()=>Promise<unknown>,done:string){B(true);E('');N('');try{await fn();N(done);await load();onChange();}catch(e){E((e as Error).message);}finally{B(false);}}
 if(!d)return error?<Notice error={error}/>:<p role="status">Loading applicant…</p>;
 const p=d.snapshot?.profile,qs=d.job?.screening_questions||[],live=d.application.state==='submitted';
 const upcoming=d.interviews.filter(i=>!i.cancelled_at&&new Date(i.starts_at)>new Date());
 return <>
  <Notice error={error} message={note}/>
  <div className="ep-actions">
   {d.application.state==='withdrawn'?<Pill tone="red">Withdrawn by applicant</Pill>:<Pill tone="teal">{stageLabel(d.application.stage)}</Pill>}
   <span className="ep-muted">{d.job?.title}</span>
   {canMove&&live&&<><select aria-label="Move to stage" value={d.application.stage} disabled={busy} onChange={e=>act(()=>command('application.move',{id,stage:e.target.value}),`Moved to ${stageLabel(e.target.value)}.`)}>{STAGES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
    {d.application.stage!=='shortlisted'&&<Button size="sm" tone="secondary" disabled={busy} onClick={()=>act(()=>command('application.move',{id,stage:'shortlisted'}),'Shortlisted.')}>Shortlist</Button>}
    {d.application.stage!=='rejected'&&<Button size="sm" tone="danger" disabled={busy} onClick={()=>act(()=>command('application.move',{id,stage:'rejected'}),'Marked as not progressing.')}>Not progressing</Button>}</>}
   {canMove&&d.application.reinstatement_requested_at&&<Button size="sm" disabled={busy} onClick={()=>act(()=>command('application.reinstate',{id}),'Application reinstated.')}>Reinstate</Button>}
  </div>
  <section className="ep-section"><h3>Profile</h3><dl className="ep-dl"><div><dt>Name</dt><dd>{p?.full_name}</dd></div><div><dt>Headline</dt><dd>{p?.headline||'–'}</dd></div><div><dt>Location</dt><dd>{p?.location||'–'}</dd></div><div><dt>Email</dt><dd>{p?.email?<a href={`mailto:${p.email}`}>{p.email}</a>:'–'}</dd></div></dl>
   {p?.skills?.length?<div className="ep-chips" style={{marginTop:10}}>{p.skills.map(s=><span key={s}>{s}</span>)}</div>:null}
   {d.snapshot?.resume_version_id&&<p style={{marginTop:12}}><a className="ep-btn secondary sm" href={`/api/resumes/${d.snapshot.resume_version_id}`}>Download resume</a></p>}</section>
  {x&&(x.readyToWork||x.availability)&&<p className="ep-notice">{x.readyToWork&&<><Pill tone="teal">Ready to work</Pill> </>}{x.availability}</p>}
  {x?.summary&&<section className="ep-section"><h3>Summary</h3><p className="job-description">{x.summary}</p></section>}
  {x&&x.experience.length>0&&<section className="ep-section"><h3>Experience</h3><ul className="ep-list">{x.experience.map((e,i)=><li key={i}><div className="ep-grow"><strong>{e.title}</strong> · {e.company}{e.location?`, ${e.location}`:''}<small>{monthLabel(e.start)} – {monthLabel(e.end)}</small>{e.description&&<span className="job-description">{e.description}</span>}</div></li>)}</ul></section>}
  {x&&x.education.length>0&&<section className="ep-section"><h3>Education</h3><ul className="ep-list">{x.education.map((e,i)=><li key={i}><div className="ep-grow"><strong>{e.qualification}</strong><small>{e.institution}{e.year?` · ${e.year}`:''}</small></div></li>)}</ul></section>}
  {x&&(x.licences.length>0||x.languages.length>0)&&<section className="ep-section"><h3>Licences and languages</h3><div className="ep-chips">{[...x.licences,...x.languages].map(l=><span key={l}>{l}</span>)}</div></section>}
  {x&&x.assessments.length>0&&<section className="ep-section"><h3>Skills assessments</h3><ul className="ep-list">{x.assessments.map(a=><li key={a.title}><div className="ep-grow">{a.title}<small>{when(a.completedAt)}</small></div><Pill tone={a.score>=75?'teal':'amber'}>{a.level} · {a.score}%</Pill></li>)}</ul></section>}
  {qs.length>0&&<section className="ep-section"><h3>Screening answers</h3><ul className="ep-list">{qs.map(q=>{const a=d.snapshot?.answers?.[q.id];const miss=q.must_have&&a!==q.expected_answer;return <li key={q.id}><div className="ep-grow">{q.question}</div><strong>{a||'–'}</strong>{q.must_have&&(miss?<Pill tone="amber">Deal-breaker not met</Pill>:<Pill tone="teal">Meets</Pill>)}</li>;})}</ul></section>}
  {d.snapshot?.cover_letter&&<section className="ep-section"><h3>Cover letter</h3><p className="job-description">{d.snapshot.cover_letter}</p></section>}
  <section className="ep-section ep-sec-messages"><h3>Messages</h3>
   <div className="ep-thread">{d.messages.length?d.messages.map(m=><div key={m.id} className={`ep-msg ${m.sender_id===d.userId?'mine':''}`}>{m.body}<small>{m.sender_id===d.userId?'You':m.sender_id===d.application.seeker_id?p?.full_name||'Applicant':'Your team'} · {ago(m.created_at)}</small></div>):<p className="ep-muted">No messages yet.</p>}</div>
   {canMove&&live&&<form onSubmit={e=>{e.preventDefault();if(message.trim())void act(async()=>{await command('message.send',{id,body:message.trim()});MS('');},'Message sent.');}} style={{display:'grid',gap:8,marginTop:8}}>
    {templates.length>0&&<select aria-label="Insert template" value="" onChange={e=>{const t=templates.find(x=>x.id===e.target.value);if(t)MS(t.body.replace(/\{name\}/g,p?.full_name?.split(' ')[0]||'there'));}}><option value="">Insert a template…</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
    <textarea value={message} onChange={e=>MS(e.target.value)} maxLength={5000} placeholder={`Write to ${p?.full_name?.split(' ')[0]||'the applicant'}`} aria-label="Message"/><div className="ep-actions"><Button size="sm" disabled={busy||!message.trim()}>Send</Button></div></form>}
  </section>
  <section className="ep-section"><h3>Interview</h3>
   {upcoming.map(i=><p key={i.id} className="ep-notice">{when(i.starts_at,{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit',timeZone:i.time_zone})} ({i.time_zone.replace('Australia/','')}) · {i.format} {isVideoInterview(i.format)&&<><a href={`/interview/${i.id}`}>Join video call</a> · </>}<a href={`/api/interviews/${i.id}`}>Add to calendar</a>{canMove&&<> · <button className="ep-btn ghost sm" onClick={()=>act(()=>command('application.interview',{id,cancel:true}),'Interview cancelled.')}>Cancel</button></>}</p>)}
   {canMove&&live&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const format=String(f.get('format'));const times=(mode==='single'?[slots[0]]:slots).filter(Boolean).map(s=>zonedIso(s,zone));if(!times.length){E('Choose at least one time.');return;}
     void act(()=>mode==='single'?command('application.interview',{id,at:times[0],timeZone:zone,format}):employerPost({action:'propose',applicationId:id,slots:times,timeZone:zone,format}),mode==='single'?'Interview booked and the applicant notified.':'Times sent. The applicant picks one in their account.');}} style={{display:'grid',gap:8}}>
    <div className="ep-actions"><label className="ep-check"><input type="radio" checked={mode==='propose'} onChange={()=>MO('propose')}/>Offer up to 3 times</label><label className="ep-check"><input type="radio" checked={mode==='single'} onChange={()=>MO('single')}/>Book one time</label></div>
    <div className="ep-actions">{(mode==='single'?[0]:[0,1,2]).map(i=><input key={i} type="datetime-local" aria-label={`Time ${i+1}`} value={slots[i]} onChange={e=>SL(slots.map((s,k)=>k===i?e.target.value:s))}/>)}<select value={zone} onChange={e=>Z(e.target.value)} aria-label="Time zone">{ZONES.map(z=><option key={z} value={z}>{z.replace('Australia/','')}</option>)}</select></div>
    <Field label="Format and details" hint="Start with “JobRoles video” to use the built-in video room, or describe a phone call or in-person meeting."><input name="format" required minLength={3} maxLength={500} defaultValue="JobRoles video call"/></Field>
    <div className="ep-actions"><Button size="sm" disabled={busy}>{mode==='single'?'Book interview':'Send times'}</Button></div></form>}
  </section>
  <section className="ep-section"><h3>Team notes</h3><p className="ep-muted" style={{marginBottom:8}}>Only your hiring team sees notes and ratings.</p>
   <ul className="ep-list">{d.notes.map(n=><li key={n.id}><div className="ep-grow"><span className="job-description">{n.body}</span><small>{when(n.created_at)}</small></div>{n.rating&&<Pill tone="amber">Rated {n.rating} of 5</Pill>}</li>)}</ul>
   {d.role&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const form=e.currentTarget;void act(async()=>{await command('application.note',{id,body:String(f.get('body')),rating:f.get('rating')?Number(f.get('rating')):undefined});form.reset();},'Note saved.');}} style={{display:'grid',gap:8,marginTop:8}}>
    <textarea name="body" required maxLength={5000} placeholder="Add a note for your team" aria-label="Note"/><div className="ep-actions"><select name="rating" aria-label="Rating"><option value="">No rating</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} of 5</option>)}</select><Button size="sm" tone="secondary" disabled={busy}>Save note</Button></div></form>}
  </section>
  <section className="ep-section"><h3>Activity</h3><ul className="ep-list">{d.history.map(h=><li key={h.id}><div className="ep-grow">{stageLabel(h.to_state)}</div><small>{when(h.created_at,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</small></li>)}</ul></section>
 </>;
}
