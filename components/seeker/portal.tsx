'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import AccountWorkspace from '../account-workspace';
import Invitations from '../invitations';
import ReviewPrompts from '../review-prompts';
import PushToggle from '../push-toggle';
import {salaryLabel} from '@/lib/salary';
import SavedView from './saved';
import {accountView} from '@/lib/navigation';
import {AppShell,AccountMenu,type NavItem} from '../employer/shell';
import {Section} from '../employer/shell';
import {Card,Empty,Icon,Notice,Pill,Stat,Tabs} from '../employer/ui';
import {get,when,ago} from '../employer/api';
type Account={configured:boolean;user:null|{id:string;email:string;confirmed:boolean}};
type App={id:string;jobId:string;title:string;company:string;companyId:string;state:string;stage:string;submittedAt:string;updatedAt:string;unread:number;
 interview:null|{id:string;startsAt:string;timeZone:string;format:string};proposal:boolean;responseShare:string|null;unknown?:boolean};
type Home={partial?:boolean;applications:App[];drafts:number;saved:number;alerts:number;invites:number;email:string;
 profile:null|{name:string;headline:boolean;location:boolean;skills:boolean;experience:boolean;searchable:boolean;resume:boolean;assessment:boolean}};
type Rec={id:string;title:string;salary_min:number|null;salary_max:number|null;salary_period:string;currency:string;companies:{name:string};job_locations:{label:string}[];distance_km:number|null};
const VIEWS:[string,string,string,string][]=[['','overview','Home','home'],['','applications','Applications','jobs'],['','profile','Profile and resume','people'],['','preferences','Application preferences','settings'],['','saved','Saved jobs and alerts','star'],['','privacy','Privacy and data','shield']];
const TOOLS:[string,string,string][]=[['/search','Find jobs','search'],['/resume','Resume builder','file'],['/assessments','Skills assessments','check'],['/events','Hiring events','calendar'],['/career-advice','Career advice','chat']];
const SUBS:Record<string,string>={applications:'Every application you’ve sent, with its messages and history.',profile:'What employers see when you apply, and your resume versions.',preferences:'Choose how your applications are sent.',saved:'Jobs you saved and the searches we email you about.',privacy:'Download your data, ask us to correct it, or delete your account.',jobs:'Finish your application.'};

export default function SeekerPortal(){
 const params=useSearchParams(),router=useRouter();
 const [account,A]=useState<Account|null>(null),[error,E]=useState(''),[admin,AD]=useState(false),[employer,EM]=useState(false);
 useEffect(()=>{let live=true;get<Account>('/api/account').then(async a=>{const d=a.user?.confirmed?await get<{isAdmin:boolean;memberships:unknown[]}>('/api/data').catch(()=>null):null;if(live){A(a);AD(Boolean(d?.isAdmin));EM(Boolean(d?.memberships?.length));}}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[]);
 const raw=accountView(`?${params}`,''),view=['hiring','analytics','candidates','feeds','reviews'].includes(raw)?'overview':raw;
 if(error)return <AppShell nav={[]} current="" crumb="Job seeker"><Notice error={error}/></AppShell>;
 if(account&&!account.user?.confirmed)return <AccountWorkspace portal="seeker"/>;
 const nav:NavItem[]=[...VIEWS.map(([group,id,label,icon])=>({group,id,label,icon,href:`/job-seeker?view=${id}`})),...TOOLS.map(([href,label,icon])=>({group:'Tools',id:href,label,icon,href}))];
 const label=VIEWS.find(v=>v[1]===view)?.[2]||'Apply';
 return <AppShell nav={nav} current={view} crumb={<>Job seeker <span aria-hidden="true">/</span> <strong>{label}</strong></>}
  search={{placeholder:'Search jobs, e.g. nurse in Geelong',onSubmit:q=>router.push(`/search?${new URLSearchParams({q})}`)}}
  end={account?.user&&<><Link className="ep-iconbtn" href="/help" aria-label="Help"><Icon name="help"/></Link><AccountMenu email={account.user.email} links={[['/job-seeker?view=profile','Profile and resume'],['/alerts','Job alerts'],...(employer?[['/employer','Employer portal'] as [string,string]]:[['/employer','Hire on JobRoles'] as [string,string]]),...(admin?[['/admin','Admin console'] as [string,string]]:[])]}/></>}
  foot={<><Link href="/employer">{employer?'Switch to employer':'Hiring? Post a job'}</Link></>}>
  {!account?<p role="status" className="ep-muted">Loading…</p>:view==='overview'?<SeekerHome/>:view==='applications'?<SeekerApplications/>:view==='saved'?<SavedView/>:
   <Section title={view==='jobs'?'Apply':label} sub={SUBS[view]}><AccountWorkspace portal="seeker" embedded/></Section>}
 </AppShell>;
}

// The job seeker's question: where do my applications stand, and what should I do next?
const TRACK=['Applied','Reviewed','Shortlisted','Interview','Offer'];
const stageIndex=(s:string)=>({new:0,reviewed:1,shortlisted:2,interview:3,offer:4,hired:4} as Record<string,number>)[s]??0;
function nextStep(a:App):[string,string,string|null]{
 if(a.state==='withdrawn')return ['Withdrawn','',null];
 if(a.stage==='rejected')return ['Not progressing','The employer has moved on with other applicants.',null];
 if(a.stage==='hired')return ['Hired','Congratulations.',null];
 if(a.unknown)return ['See messages and interview times','',`/account/applications/${a.id}`];
 if(a.interview)return ['Interview '+when(a.interview.startsAt,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:a.interview.timeZone}),a.interview.format==='video'?'Join on JobRoles':'',a.interview.format==='video'?`/interview/${a.interview.id}`:`/account/applications/${a.id}`];
 if(a.proposal)return ['Pick an interview time','',`/account/applications/${a.id}`];
 if(a.unread)return [`${a.unread} new ${a.unread===1?'message':'messages'}`,'',`/account/applications/${a.id}`];
 return ['Waiting on employer',a.responseShare!==null&&a.responseShare!==undefined?`${a.company} responds to ${a.responseShare}% of applicants`:'',null];
}
function SeekerHome(){
 const [h,H]=useState<Home|null>(null),[recs,R]=useState<Rec[]|null>(null),[error,E]=useState(''),[all,AL]=useState(false);
 useEffect(()=>{const c=new AbortController();get<Home>('/api/seeker-home',c.signal).then(H).catch(e=>{if(e.name!=='AbortError')E(e.message);});
  get<{jobs:Rec[]}>('/api/recommendations',c.signal).then(d=>R(d.jobs||[])).catch(()=>R([]));return()=>c.abort();},[]);
 if(error)return <Section title="Home"><Notice error={error}/></Section>;
 if(!h)return <Section title="Home" sub="Loading your applications…"><div className="ep-stats" aria-hidden="true" style={{height:96}}/></Section>;
 const open=h.applications.filter(a=>a.state==='submitted'&&!['rejected','hired'].includes(a.stage));
 const interviews=h.applications.filter(a=>a.interview&&a.state==='submitted').sort((x,y)=>x.interview!.startsAt.localeCompare(y.interview!.startsAt));
 const proposals=h.applications.filter(a=>a.proposal&&a.state==='submitted'),unread=h.applications.reduce((n,a)=>n+a.unread,0);
 const p=h.profile,checks:[boolean,string,string][]=[[Boolean(p?.name),'Your name','/job-seeker?view=profile'],[Boolean(p?.headline),'A headline','/job-seeker?view=profile'],[Boolean(p?.location),'Where you want to work','/job-seeker?view=profile'],
  [Boolean(p?.skills),'Your skills','/job-seeker?view=profile'],[Boolean(p?.resume),'A resume','/job-seeker?view=profile'],[Boolean(p?.experience),'Work history','/resume'],[Boolean(p?.assessment),'A skills assessment','/assessments'],[Boolean(p?.searchable),'Visible to employers','/job-seeker?view=profile']];
 const done=checks.filter(c=>c[0]).length,first=p?.name?.split(' ')[0];
 const soon=interviews[0];
 const finding=soon?`Your next interview is with ${soon.company} on ${when(soon.interview!.startsAt,{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit',timeZone:soon.interview!.timeZone})}.`
  :proposals.length?`${proposals[0].company} has offered interview times. Pick one so they can lock it in.`
  :unread?`You have ${unread} unread ${unread===1?'message':'messages'} from employers.`
  :open.length?`${open.length} ${open.length===1?'application is':'applications are'} in progress.${h.partial?' Open each one to see messages and interview times.':' Nothing needs you right now.'}`
  :done<3?'Start with your profile: it fills in every application for you, and every job here shows its pay.'
  :'Find a role you like and apply in a few minutes. Every job shows its pay.';
 const action=soon?.interview?.format==='video'?<Link className="ep-btn primary md" href={`/interview/${soon.interview.id}`}>Join interview</Link>
  :proposals[0]?<Link className="ep-btn primary md" href={`/account/applications/${proposals[0].id}`}>Pick a time</Link>:!h.applications.length&&done<3?<Link className="ep-btn primary md" href="/job-seeker?view=profile">Complete your profile</Link>:<Link className="ep-btn primary md" href="/search">Find jobs</Link>;
 const shown=all?h.applications:h.applications.slice(0,8);
 return <Section title={first?`Hello, ${first}`:'Home'} sub={finding} actions={<>{(soon||proposals[0]||(!h.applications.length&&done<3))&&<Link className="ep-btn secondary md" href="/search">Find jobs</Link>}{action}</>}>
  <div className="ep-over">
   <div className="ep-over-main">
    <div className="ep-stats" style={{marginBottom:0}}>
     <Stat label="In progress" value={open.length} hint={`${h.applications.length} sent in total`} href="/job-seeker?view=applications"/>
     <Stat label="Interviews" value={h.partial?'–':interviews.length} hint={h.partial?'Open an application to see times':proposals.length?`${proposals.length} waiting for you to pick a time`:'Booked and upcoming'} warn={proposals.length>0}/>
     <Stat label="Unread messages" value={h.partial?'–':unread} hint={h.partial?'Open an application to read them':'From employers'} href="/job-seeker?view=applications"/>
     <Stat label="Saved jobs" value={h.saved} hint={h.alerts?`${h.alerts} job ${h.alerts===1?'alert':'alerts'} on`:'No job alerts yet'} href="/job-seeker?view=saved"/>
    </div>
    <Card title="Where your applications stand" action={h.drafts>0&&<Link className="ep-btn ghost sm" href="/job-seeker?view=applications">{h.drafts} unfinished {h.drafts===1?'draft':'drafts'}</Link>}>
     {h.applications.length?<><AppRows apps={shown}/>
     {h.applications.length>8&&<div className="ep-viewall"><button className="ep-btn secondary sm" onClick={()=>AL(!all)}>{all?'Show fewer':`Show all ${h.applications.length}`}</button></div>}</>
     :<Empty title="No applications yet" action={<Link className="ep-btn primary md" href="/search">Find jobs</Link>}>When you apply, you’ll see each employer’s progress here, step by step, and how often they reply to applicants.</Empty>}
    </Card>
    <Invitations/>
    <ReviewPrompts/>
   </div>
   <aside className="ep-rail" aria-label="Your next steps">
    <h2>Your profile<span className="ep-muted" style={{fontSize:13,fontWeight:500}}>{done} of {checks.length}</span></h2>
    <Card><div className="ep-record" style={{paddingBottom:4}}><div className="ep-record-bar" aria-hidden="true"><i style={{width:`${done/checks.length*100}%`}}/></div>
     <p>{done===checks.length?'Complete. Employers who search for candidates can find you.':'A complete profile fills in your applications for you and lets employers invite you to apply.'}</p></div>
     {done<checks.length&&<ul className="sk-checks">{checks.map(([ok,l,href])=><li key={l} className={ok?'':'todo'}>{ok?<Icon name="check"/>:<i aria-hidden="true"/>}<span>{l}<span className="visually-hidden">{ok?', done':', to do'}</span></span>{!ok&&<Link href={href}>Add</Link>}</li>)}</ul>}</Card>
    <h2>Jobs for you<Link href="/search">Search all</Link></h2>
    <Card>{recs===null?<p className="ep-muted" style={{padding:'12px 0'}}>Finding matches…</p>:recs.length?<ul className="ep-list">{recs.slice(0,5).map(j=><li key={j.id}><div className="ep-grow"><strong><Link href={`/jobs/${j.id}`}>{j.title}</Link></strong><small>{j.companies.name} · {j.job_locations[0]?.label||'Remote'}{typeof j.distance_km==='number'?` · ${j.distance_km} km`:''}</small><small style={{color:'var(--ink)'}}>{salaryLabel(j)}</small></div></li>)}</ul>
     :<Empty title="No matches yet">Add a headline, location and skills and we’ll match new roles to you.</Empty>}</Card>
    <div style={{marginTop:16}}><PushToggle/></div>
   </aside>
  </div>
 </Section>;
}

// One row per application: what it is, a five-step stage track, and the next step or the employer's reply rate.
function AppRows({apps}:{apps:App[]}){
 return <ul className="sk-apps">{apps.map(a=>{const [title,sub,href]=nextStep(a),closed=a.state==='withdrawn'||['rejected'].includes(a.stage),i=stageIndex(a.stage);return <li key={a.id} className={closed?'sk-closed':''}>
      <div className="sk-app"><Link href={`/account/applications/${a.id}`}>{a.title}</Link><small>{a.company} · applied {when(a.submittedAt,{day:'numeric',month:'short'})} · updated {ago(a.updatedAt)}</small></div>
      <div><ol className="sk-track" aria-label={`Stage: ${closed?title:TRACK[i]}`}>{TRACK.map((t,k)=><li key={t} className={k<i?'on':k===i?'now':''} title={t}/>)}</ol>
       <div className="sk-track-label"><span>{closed?<Pill tone={a.state==='withdrawn'?'neutral':'red'}>{title}</Pill>:<><strong>{TRACK[i]}</strong> · step {i+1} of 5</>}</span></div></div>
      <div className={`sk-next ${href?'act':''}`}>{closed?<span>{sub}</span>:<span><strong>{href?<Link href={href}>{title}</Link>:title}</strong>{sub&&<><br/>{sub}</>}</span>}</div>
     </li>;})}</ul>;
}
type Draft={id:string;job_id:string;jobs:null|{title:string;companies:null|{name:string}}};
// Every application in one list, split by where it stands, with unfinished drafts kept apart.
function SeekerApplications(){
 const [h,H]=useState<Home|null>(null),[drafts,D]=useState<Draft[]>([]),[tab,T]=useState<'active'|'interview'|'drafts'|'closed'>('active'),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController();get<Home>('/api/seeker-home',c.signal).then(H).catch(e=>{if(e.name!=='AbortError')E(e.message);});
  get<{applications:Draft[]}>('/api/my-applications?page=0&state=draft',c.signal).then(d=>D(d.applications)).catch(()=>{});return()=>c.abort();},[]);
 const all=h?.applications||[],closed=(a:App)=>a.state==='withdrawn'||['rejected','hired'].includes(a.stage);
 const lists={active:all.filter(a=>!closed(a)),interview:all.filter(a=>!closed(a)&&(a.stage==='interview'||a.interview||a.proposal)),closed:all.filter(closed)};
 return <Section title="Applications" sub={h?`${lists.active.length} in progress · ${all.length} sent in total`:'Loading…'} actions={<Link className="ep-btn primary md" href="/search">Find jobs</Link>}>
  <Notice error={error}/>
  <Tabs value={tab} onChange={T} items={[['active','In progress',lists.active.length],['interview','Interviews',lists.interview.length],['drafts','Drafts',drafts.length],['closed','Closed',lists.closed.length]]}/>
  {tab==='drafts'?(drafts.length?<Card><ul className="ep-list">{drafts.map(d=><li key={d.id}><div className="ep-grow"><strong>{d.jobs?.title||'Application'}</strong><small>{d.jobs?.companies?.name} · not sent yet</small></div><Link className="ep-btn secondary sm" href={`/job-seeker?job=${d.job_id}#application`}>Continue</Link></li>)}</ul></Card>
   :<Card><Empty title="No drafts">Applications you start but don’t send are kept here.</Empty></Card>)
  :!h?null:lists[tab].length?<Card><AppRows apps={lists[tab]}/></Card>
  :<Card><Empty title={tab==='closed'?'Nothing closed':tab==='interview'?'No interviews yet':'No applications in progress'} action={tab==='active'?<Link className="ep-btn primary md" href="/search">Find jobs</Link>:undefined}>{tab==='interview'?'When an employer invites you to interview, it shows here with the time and a link to join.':tab==='closed'?'Withdrawn applications and roles that didn’t go ahead are kept here.':'Apply for a role and follow each step here.'}</Empty></Card>}
 </Section>;
}
