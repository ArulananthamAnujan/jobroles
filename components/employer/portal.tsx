'use client';
import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import AccountWorkspace from '../account-workspace';
import {get,command,ago} from './api';
import {Button,Card,Field,Icon,Notice} from './ui';
import Dashboard from './dashboard';
import Jobs from './jobs';
import Applicants from './applicants';
import Messages from './messages';
import Interviews from './interviews';
import Team from './team';
import Billing from './billing';
import Advertising from './advertising';
import EventsView from './events';
import CompanyProfile from './company-profile';
import Settings from './settings';
import CandidateSearch from '../candidate-search';
import JobStats from '../job-stats';
import JobFeeds from '../job-feeds';
import ReviewDesk from '../review-desk';
import ReviewInvite from './review-invite';
import {AppShell,AccountMenu,Section} from './shell';
import BulkImport from './bulk-import';
export type Company={id:string;name:string;verified_at:string|null};
export type Membership={company_id:string;role:string};
export type PortalContext={company:Company;role:string;companies:Company[];memberships:Membership[];isAdmin:boolean;userId:string;go:(view:string,params?:Record<string,string>)=>void};
type Account={configured:boolean;user:null|{id:string;email:string;confirmed:boolean}};
type Data={memberships:Membership[];companies:Company[];isAdmin:boolean;jobs:{id:string;title:string;company_id:string;state:string}[]};
const NAV:[string,string,string,string][]=[
 ['Hire','dashboard','Overview','home'],['Hire','jobs','Jobs','jobs'],['Hire','applicants','Applicants','people'],['Hire','messages','Messages','chat'],['Hire','interviews','Interviews','calendar'],['Hire','candidates','Find candidates','search'],['Hire','events','Hiring events','calendar'],
 ['Grow','advertising','Sponsored jobs','card'],['Grow','performance','Performance','chart'],['Grow','company','Company page','building'],['Grow','reviews','Reviews','star'],
 ['Manage','team','Team','team'],['Manage','billing','Billing','card'],['Manage','import','Import jobs','upload'],['Manage','settings','Settings','settings'],
];
const LEGACY:Record<string,string>={hiring:'applicants',analytics:'performance',feeds:'import',overview:'dashboard'};

function Bell(){
 const [open,O]=useState(false),[items,I]=useState<{id:string;applicationId:string;kind:string;text:string;at:string}[]>([]),[seen,S]=useState('');
 useEffect(()=>{let live=true;get<{activity:typeof items}>('/api/activity').then(d=>{if(live)I(d.activity);}).catch(()=>{});Promise.resolve().then(()=>{try{if(live)S(localStorage.getItem('ep.seen')||'');}catch{}});return()=>{live=false;};},[]);
 const unread=items.filter(i=>i.at>seen).length;
 return <><button className="ep-iconbtn" aria-label={`Notifications${unread?`, ${unread} new`:''}`} aria-expanded={open} onClick={()=>{O(!open);if(!open&&items[0]){try{localStorage.setItem('ep.seen',items[0].at);}catch{}S(items[0].at);}}}><Icon name="bell"/>{unread>0&&<span className="ep-dot">{unread>9?'9+':unread}</span>}</button>
  {open&&<div className="ep-pop" role="dialog" aria-label="Notifications"><div className="ep-pop-head">Notifications</div>{items.length?items.slice(0,20).map(i=><Link key={i.id} href={`/employer?view=applicants&application=${i.applicationId}`} onClick={()=>O(false)}><strong>{i.kind}</strong> {i.text}<small>{ago(i.at)}</small></Link>):<p className="ep-muted" style={{padding:12}}>No notifications yet.</p>}</div>}</>;
}

function Onboarding({onDone,email}:{onDone:()=>void;email:string}){
 const [busy,B]=useState(false),[error,E]=useState('');
 return <Section title="Set up your company" sub={`${email} isn’t linked to a company yet. Jobs, applicants and messages appear once it is.`}>
  <div className="ep-over"><div className="ep-over-main">
  <Card title="Register your company to start hiring"><p className="ep-muted" style={{marginBottom:14}}>We check every employer’s ABN before their roles go live. Most checks finish within one business day.</p>
  <form className="ep-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');try{await command('company.create',{name:f.get('name'),about:f.get('about')||'',abn:String(f.get('abn')||'').replace(/\s/g,'')||undefined,agency:f.get('agency')==='on'});onDone();}catch(err){E((err as Error).message);}finally{B(false);}}}>
   <Field label="Company name"><input name="name" required minLength={2} maxLength={160}/></Field>
   <Field label="ABN" hint="11 digits"><input name="abn" inputMode="numeric" pattern="[0-9 ]{11,14}" maxLength={14}/></Field>
   <Field label="About your company" wide><textarea name="about" maxLength={5000}/></Field>
   <label className="ep-check"><input name="agency" type="checkbox"/>We are a recruitment agency</label>
   <div className="ep-actions"><Button disabled={busy}>{busy?'Registering…':'Register company'}</Button></div>
  </form><Notice error={error}/></Card></div>
  <aside className="ep-rail" aria-label="Joining an existing company">
   <h2>Is your company already on JobRoles?</h2>
   <Card><div style={{padding:'12px 0',display:'grid',gap:8}}><p>Don’t register it again. Ask the company’s owner to invite you from <strong>Team</strong> in their employer portal, then open the invitation link while signed in as {email}.</p>
    <p className="ep-muted" style={{fontSize:13}}>Looking for work instead? <Link href="/job-seeker" style={{textDecoration:'underline'}}>Go to the job seeker portal</Link>.</p></div></Card>
  </aside></div></Section>;
}

export default function EmployerPortal(){
 const router=useRouter(),path=usePathname(),params=useSearchParams();
 const [account,A]=useState<Account|null>(null),[data,D]=useState<Data|null>(null),[error,E]=useState(''),[companyId,C]=useState(''),[version,V]=useState(0);
 const rawView=params.get('view')||'dashboard',view=LEGACY[rawView]??(NAV.some(n=>n[1]===rawView)?rawView:'dashboard');
 useEffect(()=>{let live=true;get<Account>('/api/account').then(async a=>{const d=a.user?.confirmed?await get<Data>('/api/data'):null;if(live){A(a);D(d);}}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[version]);
 const companies=useMemo(()=>(data?.companies||[]).filter(c=>data?.memberships.some(m=>m.company_id===c.id)),[data]);
 useEffect(()=>{if(!companies.length)return;const wanted=params.get('company');let saved='';try{saved=localStorage.getItem('ep.company')||'';}catch{}const pick=[wanted,saved].find(x=>x&&companies.some(c=>c.id===x))||companies[0].id;Promise.resolve().then(()=>C(pick));},[companies,params]);
 const nav=NAV.map(([group,id,label,icon])=>({group,id,label,icon,href:`/employer?view=${id}`}));
 const go=useCallback((next:string,extra:Record<string,string>={})=>{const p=new URLSearchParams({view:next,...extra});router.push(`${path}?${p}`,{scroll:true});},[router,path]);
 if(error)return <AppShell nav={[]} current="" crumb="Employer"><Notice error={error}/></AppShell>;
 if(!account)return <AppShell nav={nav} current={view} crumb="Employer"><p role="status" className="ep-muted">Loading your employer portal…</p></AppShell>;
 if(!account.user?.confirmed||!data)return <AccountWorkspace portal="employer"/>;
 const company=companies.find(c=>c.id===companyId),membership=data.memberships.find(m=>m.company_id===companyId);
 const ctx:PortalContext|null=company&&membership?{company,role:membership.role,companies,memberships:data.memberships,isAdmin:data.isAdmin,userId:account.user.id,go}:null;
 const canManage=membership?.role==='owner'||membership?.role==='recruiter';
 let body:ReactNode;
 if(!companies.length)body=<Onboarding email={account.user.email} onDone={()=>V(v=>v+1)}/>;
 else if(!ctx)body=<p role="status">Loading…</p>;
 else switch(view){
  case 'jobs':body=<Jobs ctx={ctx}/>;break;
  case 'applicants':body=<Applicants ctx={ctx}/>;break;
  case 'messages':body=<Messages ctx={ctx}/>;break;
  case 'interviews':body=<Interviews ctx={ctx}/>;break;
  case 'candidates':body=<Section title={params.get('title')?`Matched candidates for ${params.get('title')}`:'Find candidates'} sub="People who chose to be found by employers. They see your invitation in their account."><CandidateSearch companies={canManage&&ctx.company.verified_at?[ctx.company]:[]} jobs={data.jobs||[]} initial={params.get('q')?{q:params.get('q')||'',near:params.get('near')||'',title:params.get('title')||undefined}:undefined}/>{!ctx.company.verified_at&&<p className="ep-muted">Candidate search opens once your company is verified.</p>}{!canManage&&<p className="ep-muted">Only owners and recruiters can search candidates.</p>}</Section>;break;
  case 'performance':body=<Section title="Performance" sub="How each listing performs. Fixed 30-day sponsorship is also available here."><JobStats companies={canManage?[ctx.company]:[]}/></Section>;break;
  case 'events':body=<EventsView ctx={ctx}/>;break;
  case 'advertising':body=<Advertising ctx={ctx}/>;break;
  case 'company':body=<CompanyProfile ctx={ctx}/>;break;
  case 'reviews':body=<Section title="Reviews" sub="Hiring-experience reviews from people who applied. Owners can reply publicly."><ReviewInvite companyId={ctx.company.id}/><ReviewDesk companies={[ctx.company]} ownerOf={ctx.role==='owner'?[ctx.company.id]:[]}/></Section>;break;
  case 'team':body=<Team ctx={ctx}/>;break;
  case 'billing':body=<Billing ctx={ctx}/>;break;
  case 'import':body=<BulkImport ctx={ctx} feeds={<JobFeeds companies={[ctx.company]} ownerOf={ctx.role==='owner'?[ctx.company.id]:[]} isAdmin={false}/>}/>;break;
  case 'settings':body=<Settings ctx={ctx}/>;break;
  default:body=<Dashboard ctx={ctx}/>;
 }
 const label=NAV.find(n=>n[1]===view)?.[2]||'Overview';
 const pick=(id:string)=>{C(id);try{localStorage.setItem('ep.company',id);}catch{}};
 return <AppShell nav={companies.length?nav:[]} current={view} crumb={companies.length?<>{company?<>{company.name} <span aria-hidden="true">/</span> </>:null}<strong>{label}</strong></>:<strong>Set up your company</strong>}
  search={companies.length?{placeholder:'Search applicants',onSubmit:q=>go('applicants',{q})}:undefined}
  org={companies.length>0&&<div className="ep-org">{companies.length>1?<label><small>Company</small><select value={companyId} onChange={e=>pick(e.target.value)}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:company&&<><small>Employer</small><strong>{company.name}</strong></>}
   {company&&!company.verified_at&&<span className="ep-pill amber" style={{width:'fit-content',marginTop:4}}>Verification pending</span>}</div>}
  end={<><Link className="ep-iconbtn" href="/help" aria-label="Help"><Icon name="help"/></Link><Bell/><AccountMenu email={account.user.email} links={[...(company?[[`/companies/${company.id}`,'View company page'] as [string,string]]:[]),['/job-seeker','Job seeker view'],...(data.isAdmin?[['/admin','Admin console'] as [string,string]]:[]),['/employer?view=settings','Settings']]}/></>}
  foot={<>{company&&<Link href={`/companies/${company.id}`}>View company page</Link>}<Link href="/job-seeker">Switch to job seeker</Link></>}>
  {body}
 </AppShell>;
}

export {Section};
