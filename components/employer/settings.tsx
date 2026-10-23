'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {employerGet,employerPost} from './api';
import {Button,Card,Notice} from './ui';
import {Section,type PortalContext} from './portal';
type Prefs={new_applicant:boolean;messages:boolean;stage_changes:boolean;daily_digest:boolean};
export default function Settings({ctx}:{ctx:PortalContext}){
 const [p,P]=useState<Prefs|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false);
 useEffect(()=>{const c=new AbortController();employerGet<{prefs:Prefs}>('prefs',{},c.signal).then(d=>P(d.prefs)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[]);
 const row=(k:keyof Prefs,title:string,text:string,disabled=false)=><li><div className="ep-grow"><strong>{title}</strong><small>{text}</small></div><input type="checkbox" checked={Boolean(p?.[k])} disabled={disabled} aria-label={title} onChange={e=>p&&P({...p,[k]:e.target.checked})}/></li>;
 return <Section title="Settings" sub={`Your personal settings for ${ctx.company.name} and any other company you belong to.`}>
  <Notice error={error} message={note}/>
  <div className="ep-grid two">
   <Card title="Email notifications">{p?<><ul className="ep-list">
    {row('daily_digest','Daily applicant summary','One email a day listing new applicants, instead of one email per applicant.')}
    {row('new_applicant','Each new applicant','An email whenever someone applies to a job you manage.',p.daily_digest)}
    {row('messages','Messages from applicants','An email when an applicant replies.')}
    {row('stage_changes','Interviews and other updates','Interview bookings, withdrawals and reinstatement requests.')}
   </ul><div className="ep-actions" style={{marginTop:12}}><Button disabled={busy} onClick={async()=>{B(true);E('');N('');try{await employerPost({action:'prefs',newApplicant:p.new_applicant,messages:p.messages,stageChanges:p.stage_changes,dailyDigest:p.daily_digest});N('Notification settings saved.');}catch(e){E((e as Error).message);}finally{B(false);}}}>Save</Button></div></>:<p role="status">Loading…</p>}</Card>
   <Card title="Account and security"><ul className="ep-list">
    <li><div className="ep-grow"><strong>Password</strong><small>Change your password by email link.</small></div><Link className="ep-btn secondary sm" href="/account/reset">Change</Link></li>
    <li><div className="ep-grow"><strong>Your data</strong><small>Export, correct or delete your personal information.</small></div><Link className="ep-btn secondary sm" href="/job-seeker?view=privacy">Privacy controls</Link></li>
    <li><div className="ep-grow"><strong>Company page</strong><small>Logo, photos, benefits and facts.</small></div><Link className="ep-btn secondary sm" href="/employer?view=company">Edit</Link></li>
    <li><div className="ep-grow"><strong>Team access</strong><small>Invite or remove recruiters and hiring managers.</small></div><Link className="ep-btn secondary sm" href="/employer?view=team">Manage</Link></li>
   </ul></Card>
  </div>
 </Section>;
}
