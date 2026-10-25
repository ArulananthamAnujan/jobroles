'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {employerGet,when} from './api';
import {Button,Card,Empty,Icon,Notice,Stat} from './ui';
import {Section,type PortalContext} from './portal';
import {Bars} from './bars';
type Dash={live:number;drafts:number;pending:number;paused:number;newToday:number;newWeek:number;unreviewed:number;interviewsWeek:number;unread:number;views7:number;
 expiring:{id:string;title:string;expiresAt:string}[];awaiting:{applicationId:string;jobTitle:string;name:string;submittedAt:string}[];upcoming:{applicationId:string;name:string;jobTitle:string;startsAt:string;timeZone:string}[]};
type Pipe={jobId:string;title:string;location:string|null;publishedAt:string;expiresAt:string;new:number;reviewed:number;shortlisted:number;interview:number;offer:number;total:number;oldestNewDays:number;views7:number};
type Overview={pipeline:Pipe[];daily:{day:string;count:number}[];waiting:{applicationId:string;name:string;jobTitle:string;submittedAt:string;days:number}[];waitingTotal:number;waitingOver3:number;
 response:{applications:number;responded:number;respondedShare:number|null;medianDays:number|null;public:boolean}};
// Stages in pipeline order, darkest first: the people nobody has looked at yet carry the strongest colour.
const STAGE_KEYS=[['new','New','var(--c1)'],['reviewed','Reviewed','var(--c2)'],['shortlisted','Shortlisted','var(--c3)'],['interview','Interview','var(--c4)'],['offer','Offer or hired','var(--c5)']] as const;
const plural=(n:number,one:string,many=`${one}s`)=>`${n} ${n===1?one:many}`;

// The employer's question on this screen: who is waiting on us, and is each job's pipeline moving?
export default function Dashboard({ctx}:{ctx:PortalContext}){
 const [d,D]=useState<Dash|null>(null),[o,O]=useState<Overview|null>(null),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController(),q={company:ctx.company.id};
  Promise.all([employerGet<Dash>('dashboard',q,c.signal),employerGet<Overview>('overview',q,c.signal)]).then(([a,b])=>{D(a);O(b);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id]);
 const canPost=ctx.role==='owner'||ctx.role==='recruiter';
 if(error)return <Section title={ctx.company.name}><Notice error={error}/></Section>;
 if(!d||!o)return <Section title={ctx.company.name} sub="Loading your hiring overview…"><div className="ep-stats" aria-hidden="true" style={{height:96}}/></Section>;
 const first=d.live+d.drafts+d.pending+d.paused===0;
 const oldest=o.waiting[0];
 const finding=first?'Post your first job, or bring all your open roles across from a spreadsheet in one go.'
  :o.waitingTotal===0?`Nobody is waiting on you.${o.response.respondedShare!==null?` You have responded to ${o.response.respondedShare}% of applicants in the last six months.`:''}`
  :`${plural(o.waitingTotal,'applicant')} ${o.waitingTotal===1?'is':'are'} waiting for a first look${o.waitingOver3?`, ${o.waitingOver3} for more than 3 days`:''}.`;
 return <Section title={ctx.company.name} sub={finding} actions={<>
   {canPost&&<Link className="ep-btn secondary md" href="/employer?view=import">Import jobs</Link>}
   {canPost&&<Button tone={oldest?'secondary':'primary'} onClick={()=>ctx.go('jobs',{new:'1'})}>Post a job</Button>}
   {oldest&&<Link className="ep-btn primary md" href={`/employer?view=applicants&application=${oldest.applicationId}`}>Review oldest applicant</Link>}</>}>
  {!ctx.company.verified_at&&<p className="ep-notice warn">We’re checking your ABN. You can prepare and import jobs now; they go live once your company is verified and each job is approved.</p>}
  {first?<FirstRun canPost={canPost} go={ctx.go} ctx={ctx}/>:<div className="ep-over">
   <div className="ep-over-main">
    <div className="ep-stats" style={{marginBottom:0}}>
     <Stat label="Waiting for you" value={o.waitingTotal} hint={o.waitingOver3?`${o.waitingOver3} over 3 days`:'None over 3 days'} warn={o.waitingOver3>0} href="/employer?view=applicants&stage=new"/>
     <Stat label="New applicants" value={d.newWeek} hint={`Last 7 days · ${d.newToday} today`} href="/employer?view=applicants"/>
     <Stat label="Interviews" value={d.interviewsWeek} hint="Next 7 days" href="/employer?view=interviews"/>
     <Stat label="Live jobs" value={d.live} hint={[d.pending&&`${d.pending} awaiting approval`,d.drafts&&plural(d.drafts,'draft')].filter(Boolean).join(' · ')||`${d.views7.toLocaleString('en-AU')} views in 7 days`} href="/employer?view=jobs"/>
    </div>
    <Pipeline jobs={o.pipeline} canPost={canPost} go={ctx.go}/>
    <Bars title="Applications per day" days={o.daily} recent={7}/>
   </div>
   <aside className="ep-rail" aria-label="Needs attention">
    <h2>Waiting longest{o.waitingTotal>o.waiting.length&&<Link href="/employer?view=applicants&stage=new">All {o.waitingTotal}</Link>}</h2>
    <Card>{o.waiting.length?<ul className="ep-list">{o.waiting.slice(0,5).map(a=><li key={a.applicationId}><div className="ep-grow"><strong>{a.name}</strong><small>{a.jobTitle} · {a.days===0?'today':plural(a.days,'day')}</small></div>
      <Link className="ep-btn secondary sm" href={`/employer?view=applicants&application=${a.applicationId}`}>Review</Link></li>)}</ul>
     :<Empty title="You’re all caught up">New applicants appear here the moment they apply.</Empty>}</Card>
    <h2>Your response record</h2>
    <Card><Record r={o.response} companyId={ctx.company.id}/></Card>
    <h2>Upcoming interviews<Link href="/employer?view=interviews">Calendar</Link></h2>
    <Card>{d.upcoming.length?<ul className="ep-list">{d.upcoming.slice(0,4).map(i=><li key={i.applicationId+i.startsAt}><div className="ep-grow"><strong>{i.name}</strong><small>{i.jobTitle}</small></div>
      <span className="ep-muted" style={{fontVariantNumeric:'tabular-nums',fontSize:13,textAlign:'right'}}>{when(i.startsAt,{weekday:'short',day:'numeric',month:'short'})}<br/>{when(i.startsAt,{hour:'numeric',minute:'2-digit'})}</span></li>)}</ul>
     :<Empty title="No interviews booked">Offer times from an applicant’s profile and they pick one.</Empty>}</Card>
    {d.expiring.length>0&&<><h2>Closing in 7 days</h2>
     <Card><ul className="ep-list">{d.expiring.slice(0,4).map(j=><li key={j.id}><div className="ep-grow"><strong>{j.title}</strong><small>Closes {when(j.expiresAt,{weekday:'short',day:'numeric',month:'short'})}</small></div>
      {canPost&&<Link className="ep-btn secondary sm" href={`/employer?view=jobs&edit=${j.id}`}>Extend</Link>}</li>)}</ul></Card></>}
   </aside>
  </div>}
 </Section>;
}

function FirstRun({canPost,go,ctx}:{canPost:boolean;go:PortalContext['go'];ctx:PortalContext}){
 const [setup,SU]=useState<{page:number;team:number;invites:number}|null>(null);
 useEffect(()=>{const c=new AbortController(),q={company:ctx.company.id};
  Promise.all([employerGet<{company:{logo_url:string|null;pitch:string|null;about:string|null;benefits:string[];photos:string[]}}>('company',q,c.signal),employerGet<{members:unknown[];invitations:unknown[]|null}>('team',q,c.signal).catch(()=>({members:[],invitations:[]}))])
   .then(([co,t])=>{const x=co.company;SU({page:[x.logo_url,(x.pitch||'').length>=60,(x.about||'').length>=200,x.benefits.length>=3,x.photos.length>=3].filter(Boolean).length,team:t.members.length,invites:(t.invitations||[]).length});}).catch(()=>{});return()=>c.abort();},[ctx.company.id]);
 const ways:[string,string,string,()=>void][]=[
  ['Post a job','Write one listing with our assistant. It goes live after a quick check.','Post a job',()=>go('jobs',{new:'1'})],
  ['Import a spreadsheet','Upload a CSV or Excel file of up to 200 jobs, match the columns and check every row before it saves.','Import jobs',()=>go('import')],
  ['Connect your ATS','Keep roles in sync with your applicant tracking system or careers page feed.','Connect a feed',()=>go('import',{tab:'feeds'})]];
 // The steps between registering and the first applicant, each with its state and a way to do it.
 const steps:[boolean,string,string,string|null,string][]=[
  [true,'Register your company','Done','',''],
  [Boolean(ctx.company.verified_at),'ABN check',ctx.company.verified_at?'Verified':'We’re checking it, usually within one business day. You don’t need to do anything.',null,''],
  [false,'Add your first jobs','Post one, import a spreadsheet, or connect your ATS.','/employer?view=import','Add jobs'],
  [(setup?.page??0)>=4,'Complete your company page',setup?`${setup.page} of 5 done: logo, why work here, about, benefits and photos.`:'Logo, why work here, about, benefits and photos.','/employer?view=company','Edit page'],
  [(setup?.team??1)>1||(setup?.invites??0)>0,'Invite your team','Recruiters and hiring managers, each with the right access.','/employer?view=team','Invite'],
  [false,'Choose your notifications','New applicants, messages and a daily summary, by email.','/employer?view=settings','Settings']];
 const done=steps.filter(s=>s[0]).length;
 return <div className="ep-over">
  <div className="ep-over-main">
   <div className="ep-grid three">{ways.map(([t,s,b,f],i)=><Card key={t} title={t}><p className="ep-muted" style={{minHeight:60}}>{s}</p>{canPost&&<div style={{marginTop:12}}><Button tone={i===0?'primary':'secondary'} onClick={f}>{b}</Button></div>}</Card>)}</div>
   <Card title="What job seekers see next to your jobs" action={<Link className="ep-btn ghost sm" href={`/companies/${ctx.company.id}`}>Your public page</Link>}>
    <ul className="ep-list">
     <li><div className="ep-grow"><strong>Pay on every listing</strong><small>Every job shows its real pay range. Listings without pay can’t be posted.</small></div></li>
     <li><div className="ep-grow"><strong>Verified employer badge</strong><small>Shown once your ABN check is done.</small></div></li>
     <li><div className="ep-grow"><strong>Your response record</strong><small>How many applicants hear back from you, and how quickly. Shown after 5 applications.</small></div></li>
    </ul></Card>
  </div>
  <aside className="ep-rail" aria-label="Get set up">
   <h2>Get set up<span className="ep-muted" style={{fontSize:13,fontWeight:500}}>{done} of {steps.length}</span></h2>
   <Card><div className="ep-record" style={{paddingBottom:4}}><div className="ep-record-bar" aria-hidden="true"><i style={{width:`${done/steps.length*100}%`}}/></div></div>
    <ul className="sk-steps">{steps.map(([ok,t,sub,href,label])=><li key={t} className={ok?'ok':''}>{ok?<Icon name="check"/>:<i aria-hidden="true"/>}<div className="ep-grow"><strong>{t}<span className="visually-hidden">{ok?', done':', to do'}</span></strong><small>{sub}</small></div>{!ok&&href&&<Link className="ep-btn secondary sm" href={href}>{label}</Link>}</li>)}</ul></Card>
  </aside>
 </div>;
}

// One strip per live job, scaled to the busiest job so the strips compare; each stage links to its applicants.
function Pipeline({jobs,canPost,go}:{jobs:Pipe[];canPost:boolean;go:PortalContext['go']}){
 const top=Math.max(1,...jobs.map(j=>j.total));
 return <Card title="Pipeline by job" action={<div className="ep-legend" aria-hidden="true">{STAGE_KEYS.map(([k,l,c])=><span key={k}><i style={{background:c}}/>{l}</span>)}</div>}>
  {jobs.length?<><div className="ep-pipe-head" aria-hidden="true"><span>Live job</span><span>Applicants by stage</span><span>Total</span><span>Oldest new</span></div>
   <ul className="ep-pipe">{jobs.map(j=><li key={j.jobId}>
    <div className="ep-pipe-job"><Link href={`/employer?view=applicants&job=${j.jobId}`}>{j.title}</Link><small>{j.location||'No location'}{j.views7?` · ${j.views7.toLocaleString('en-AU')} views this week`:''}</small></div>
    <div className="ep-strip" style={{width:`${Math.max(4,j.total/top*100)}%`}} role="img" aria-label={`${j.title}: ${STAGE_KEYS.map(([k,l])=>`${j[k]} ${l.toLowerCase()}`).join(', ')}`}>
     {STAGE_KEYS.filter(([k])=>j[k]>0).map(([k,l,c])=><Link key={k} href={`/employer?view=applicants&job=${j.jobId}&stage=${k}`} style={{flex:j[k],background:c}} title={`${l}: ${j[k]}`} aria-label={`${l}: ${j[k]}`}/>)}
    </div>
    <div className="ep-pipe-total">{j.total}</div>
    <div className={`ep-pipe-wait ${j.oldestNewDays>3?'late':''}`}>{j.new?(j.oldestNewDays===0?'Today':plural(j.oldestNewDays,'day')):'–'}</div>
   </li>)}</ul></>
  :<Empty title="No live jobs" action={canPost&&<Button onClick={()=>go('jobs',{new:'1'})}>Post a job</Button>}>Jobs awaiting approval, drafts and paused jobs are on the Jobs page.</Empty>}
 </Card>;
}

// The response record is shown on the company page once five people have applied: only JobRoles shows job seekers this.
function Record({r,companyId}:{r:Overview['response'];companyId:string}){
 if(!r.applications)return <div className="ep-record"><p>Once people apply, we show how many of them you respond to and how quickly. Job seekers see it on your company page.</p></div>;
 return <div className="ep-record">
  <div className="ep-record-figure"><strong>{r.respondedShare??0}%</strong><span>of {plural(r.applications,'applicant')} heard back</span></div>
  <div className="ep-record-bar" aria-hidden="true"><i style={{width:`${r.respondedShare??0}%`}}/></div>
  <p>{r.medianDays!==null?`Half got a first response within ${r.medianDays} ${r.medianDays===1?'day':'days'}. `:''}Moving someone to any stage or sending a message counts. Last six months.</p>
  <div className="ep-public">{r.public?<>Shown on your <Link href={`/companies/${companyId}`} style={{textDecoration:'underline'}}>company page</Link>. A high figure gets more people to apply.</>:<>Appears on your company page once 5 people have applied.</>}</div>
 </div>;
}
