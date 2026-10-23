'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {employerGet,when,ago} from './api';
import {Button,Card,Empty,Notice,Stat} from './ui';
import {Section,type PortalContext} from './portal';
type Dash={live:number;drafts:number;pending:number;paused:number;newToday:number;newWeek:number;unreviewed:number;interviewsWeek:number;unread:number;views7:number;
 expiring:{id:string;title:string;expiresAt:string}[];awaiting:{applicationId:string;jobTitle:string;name:string;submittedAt:string}[];upcoming:{applicationId:string;name:string;jobTitle:string;startsAt:string;timeZone:string}[]};
export default function Dashboard({ctx}:{ctx:PortalContext}){
 const [d,D]=useState<Dash|null>(null),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController();employerGet<Dash>('dashboard',{company:ctx.company.id},c.signal).then(D).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id]);
 const first=ctx.userId&&d&&d.live+d.drafts+d.pending+d.paused===0;
 return <Section title={`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}`} sub={`Here’s what needs your attention at ${ctx.company.name}.`} actions={<><Button onClick={()=>ctx.go('jobs',{new:'1'})}>Post a job</Button><Button tone="secondary" onClick={()=>ctx.go('applicants')}>Review applicants</Button></>}>
  <Notice error={error}/>
  {!ctx.company.verified_at&&<p className="ep-notice">Your company is awaiting ABN verification. You can prepare jobs now; they go live after verification and review.</p>}
  {d&&<>
   <div className="ep-stats">
    <Stat label="Live jobs" value={d.live} hint={d.pending?`${d.pending} awaiting approval`:d.drafts?`${d.drafts} drafts`:undefined} href="/employer?view=jobs"/>
    <Stat label="New applicants today" value={d.newToday} hint={`${d.newWeek} this week`} href="/employer?view=applicants"/>
    <Stat label="Not yet reviewed" value={d.unreviewed} href="/employer?view=applicants&stage=new"/>
    <Stat label="Interviews this week" value={d.interviewsWeek} href="/employer?view=interviews"/>
    <Stat label="Unread messages" value={d.unread} href="/employer?view=messages"/>
    <Stat label="Job views, 7 days" value={d.views7} href="/employer?view=performance"/>
   </div>
   {first?<Card><Empty title="Post your first job" action={<Button onClick={()=>ctx.go('jobs',{new:'1'})}>Post a job</Button>}>Every listing shows its pay range and goes live after a quick review. You can also import jobs from your ATS.</Empty></Card>:
   <div className="ep-grid two">
    <Card title="Applicants waiting for review" action={<Link className="ep-btn ghost sm" href="/employer?view=applicants&stage=new">See all</Link>}>
     {d.awaiting.length?<ul className="ep-list">{d.awaiting.map(a=><li key={a.applicationId}><div className="ep-grow"><strong>{a.name||'Applicant'}</strong><small>{a.jobTitle} · applied {ago(a.submittedAt)}</small></div><Link className="ep-btn secondary sm" href={`/employer?view=applicants&application=${a.applicationId}`}>Review</Link></li>)}</ul>:<Empty title="You’re all caught up">New applicants will appear here.</Empty>}
    </Card>
    <Card title="Upcoming interviews" action={<Link className="ep-btn ghost sm" href="/employer?view=interviews">Calendar</Link>}>
     {d.upcoming.length?<ul className="ep-list">{d.upcoming.map(i=><li key={i.applicationId+i.startsAt}><div className="ep-grow"><strong>{i.name}</strong><small>{i.jobTitle}</small></div><span>{when(i.startsAt,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</span></li>)}</ul>:<Empty title="No interviews booked">Offer interview times from an applicant’s profile.</Empty>}
    </Card>
    <Card title="Jobs closing within 7 days" action={<Link className="ep-btn ghost sm" href="/employer?view=jobs">Jobs</Link>}>
     {d.expiring.length?<ul className="ep-list">{d.expiring.map(j=><li key={j.id}><div className="ep-grow"><strong>{j.title}</strong><small>Closes {when(j.expiresAt)}</small></div><Link className="ep-btn secondary sm" href={`/employer?view=jobs&edit=${j.id}`}>Repost</Link></li>)}</ul>:<Empty title="Nothing closing soon"/>}
    </Card>
    <Card title="Quick actions">
     <ul className="ep-list"><li><div className="ep-grow"><strong>Search candidates</strong><small>Invite people who match your role</small></div><Link className="ep-btn secondary sm" href="/employer?view=candidates">Search</Link></li>
      <li><div className="ep-grow"><strong>Sponsor a job</strong><small>Reach more people in best-match search</small></div><Link className="ep-btn secondary sm" href="/employer?view=performance">Sponsor</Link></li>
      <li><div className="ep-grow"><strong>Complete your company page</strong><small>Logo, photos, benefits and facts help people apply</small></div><Link className="ep-btn secondary sm" href="/employer?view=company">Edit</Link></li>
      <li><div className="ep-grow"><strong>Invite your team</strong><small>Recruiters and hiring managers</small></div><Link className="ep-btn secondary sm" href="/employer?view=team">Invite</Link></li></ul>
    </Card>
   </div>}
  </>}
  {!d&&!error&&<p role="status">Loading dashboard…</p>}
 </Section>;
}
