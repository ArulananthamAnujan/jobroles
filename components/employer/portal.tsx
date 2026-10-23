'use client';
import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import AccountWorkspace from '../account-workspace';
import {Brand} from '../market-ui';
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
import CompanyProfile from './company-profile';
import Settings from './settings';
import CandidateSearch from '../candidate-search';
import JobStats from '../job-stats';
import JobFeeds from '../job-feeds';
import ReviewDesk from '../review-desk';
import './portal.css';
export type Company={id:string;name:string;verified_at:string|null};
export type Membership={company_id:string;role:string};
export type PortalContext={company:Company;role:string;companies:Company[];memberships:Membership[];isAdmin:boolean;userId:string;go:(view:string,params?:Record<string,string>)=>void};
type Account={configured:boolean;user:null|{id:string;email:string;confirmed:boolean}};
type Data={memberships:Membership[];companies:Company[];isAdmin:boolean;jobs:{id:string;title:string;company_id:string;state:string}[]};
const NAV:[string,string,string,string][]=[
 ['Hire','dashboard','Dashboard','home'],['Hire','jobs','Jobs','jobs'],['Hire','applicants','Applicants','people'],['Hire','messages','Messages','chat'],['Hire','interviews','Interviews','calendar'],['Hire','candidates','Find candidates','search'],
 ['Grow','advertising','Sponsored jobs','card'],['Grow','performance','Performance','chart'],['Grow','company','Company page','building'],['Grow','reviews','Reviews','star'],
 ['Manage','team','Team','team'],['Manage','billing','Billing','card'],['Manage','import','Import jobs','upload'],['Manage','settings','Settings','settings'],
];
const LEGACY:Record<string,string>={hiring:'applicants',analytics:'performance',feeds:'import',overview:'dashboard'};

function Bell(){
 const [open,O]=useState(false),[items,I]=useState<{id:string;applicationId:string;kind:string;text:string;at:string}[]>([]),[seen,S]=useState('');
 useEffect(()=>{let live=true;get<{activity:typeof items}>('/api/activity').then(d=>{if(live)I(d.activity);}).catch(()=>{});Promise.resolve().then(()=>{try{if(live)S(localStorage.getItem('ep.seen')||'');}catch{}});return()=>{live=false;};},[]);
 const unread=items.filter(i=>i.at>seen).length;
 return <><button className="ep-bell" aria-label={`Notifications${unread?`, ${unread} new`:''}`} aria-expanded={open} onClick={()=>{O(!open);if(!open&&items[0]){try{localStorage.setItem('ep.seen',items[0].at);}catch{}S(items[0].at);}}}><Icon name="bell"/>{unread>0&&<span className="ep-dot">{unread>9?'9+':unread}</span>}</button>
  {open&&<div className="ep-bell-menu" role="dialog" aria-label="Notifications">{items.length?items.slice(0,20).map(i=><Link key={i.id} href={`/employer?view=applicants&application=${i.applicationId}`} onClick={()=>O(false)}><strong>{i.kind}</strong> {i.text}<small>{ago(i.at)}</small></Link>):<p className="ep-muted" style={{padding:12}}>No notifications yet.</p>}</div>}</>;
}

function Onboarding({onDone}:{onDone:()=>void}){
 const [busy,B]=useState(false),[error,E]=useState('');
 return <Card title="Register your company to start hiring"><p className="ep-muted" style={{marginBottom:14}}>We check every employer’s ABN before their roles go live. Most checks finish within one business day.</p>
  <form className="ep-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');try{await command('company.create',{name:f.get('name'),about:f.get('about')||'',abn:String(f.get('abn')||'').replace(/\s/g,'')||undefined,agency:f.get('agency')==='on'});onDone();}catch(err){E((err as Error).message);}finally{B(false);}}}>
   <Field label="Company name"><input name="name" required minLength={2} maxLength={160}/></Field>
   <Field label="ABN" hint="11 digits"><input name="abn" inputMode="numeric" pattern="[0-9 ]{11,14}" maxLength={14}/></Field>
   <Field label="About your company" wide><textarea name="about" maxLength={5000}/></Field>
   <label className="ep-check"><input name="agency" type="checkbox"/>We are a recruitment agency</label>
   <div className="ep-actions"><Button disabled={busy}>{busy?'Registering…':'Register company'}</Button></div>
  </form><Notice error={error}/></Card>;
}

export default function EmployerPortal(){
 const router=useRouter(),path=usePathname(),params=useSearchParams();
 const [account,A]=useState<Account|null>(null),[data,D]=useState<Data|null>(null),[error,E]=useState(''),[companyId,C]=useState(''),[version,V]=useState(0);
 const rawView=params.get('view')||'dashboard',view=LEGACY[rawView]??(NAV.some(n=>n[1]===rawView)?rawView:'dashboard');
 useEffect(()=>{let live=true;get<Account>('/api/account').then(async a=>{const d=a.user?.confirmed?await get<Data>('/api/data'):null;if(live){A(a);D(d);}}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[version]);
 const companies=useMemo(()=>(data?.companies||[]).filter(c=>data?.memberships.some(m=>m.company_id===c.id)),[data]);
 useEffect(()=>{if(!companies.length)return;const wanted=params.get('company');let saved='';try{saved=localStorage.getItem('ep.company')||'';}catch{}const pick=[wanted,saved].find(x=>x&&companies.some(c=>c.id===x))||companies[0].id;Promise.resolve().then(()=>C(pick));},[companies,params]);
 const go=useCallback((next:string,extra:Record<string,string>={})=>{const p=new URLSearchParams({view:next,...extra});router.push(`${path}?${p}`,{scroll:true});},[router,path]);
 if(error)return <div className="ep"><main className="ep-main"><Notice error={error}/></main></div>;
 if(!account)return <div className="ep"><main className="ep-main" style={{gridColumn:'1/-1'}}><p role="status">Loading your employer portal…</p></main></div>;
 if(!account.user?.confirmed||!data)return <AccountWorkspace portal="employer"/>;
 const company=companies.find(c=>c.id===companyId),membership=data.memberships.find(m=>m.company_id===companyId);
 const ctx:PortalContext|null=company&&membership?{company,role:membership.role,companies,memberships:data.memberships,isAdmin:data.isAdmin,userId:account.user.id,go}:null;
 const canManage=membership?.role==='owner'||membership?.role==='recruiter';
 let body:ReactNode;
 if(!companies.length)body=<Onboarding onDone={()=>V(v=>v+1)}/>;
 else if(!ctx)body=<p role="status">Loading…</p>;
 else switch(view){
  case 'jobs':body=<Jobs ctx={ctx}/>;break;
  case 'applicants':body=<Applicants ctx={ctx}/>;break;
  case 'messages':body=<Messages ctx={ctx}/>;break;
  case 'interviews':body=<Interviews ctx={ctx}/>;break;
  case 'candidates':body=<Section title="Find candidates" sub="People who chose to be found by employers. They see your invitation in their account."><CandidateSearch companies={canManage&&ctx.company.verified_at?[ctx.company]:[]} jobs={data.jobs||[]}/>{!ctx.company.verified_at&&<p className="ep-muted">Candidate search opens once your company is verified.</p>}{!canManage&&<p className="ep-muted">Only owners and recruiters can search candidates.</p>}</Section>;break;
  case 'performance':body=<Section title="Performance" sub="How each listing performs. Fixed 30-day sponsorship is also available here."><JobStats companies={canManage?[ctx.company]:[]}/></Section>;break;
  case 'advertising':body=<Advertising ctx={ctx}/>;break;
  case 'company':body=<CompanyProfile ctx={ctx}/>;break;
  case 'reviews':body=<Section title="Reviews" sub="Hiring-experience reviews from people who applied. Owners can reply publicly."><ReviewDesk companies={[ctx.company]} ownerOf={ctx.role==='owner'?[ctx.company.id]:[]}/></Section>;break;
  case 'team':body=<Team ctx={ctx}/>;break;
  case 'billing':body=<Billing ctx={ctx}/>;break;
  case 'import':body=<Section title="Import jobs" sub="Connect your ATS or careers page and we keep your roles in sync."><JobFeeds companies={[ctx.company]} ownerOf={ctx.role==='owner'?[ctx.company.id]:[]} isAdmin={false}/></Section>;break;
  case 'settings':body=<Settings ctx={ctx}/>;break;
  default:body=<Dashboard ctx={ctx}/>;
 }
 return <div className="ep">
  <header className="ep-top"><Brand/><span className="ep-tag">Employer</span>
   {companies.length>1&&<label className="ep-switch"><span className="visually-hidden">Company</span><select value={companyId} onChange={e=>{C(e.target.value);try{localStorage.setItem('ep.company',e.target.value);}catch{}}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
   {companies.length===1&&company&&<span className="ep-switch"><strong>{company.name}</strong>{!company.verified_at&&<span className="ep-pill amber">Verification pending</span>}</span>}
   <div className="ep-top-end">{company&&<Link href={`/companies/${company.id}`}>View company page</Link>}{data.isAdmin&&<Link href="/admin">Admin</Link>}<Bell/><Link href="/job-seeker">Job seeker view</Link><button className="ep-btn ghost sm" onClick={async()=>{await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});router.replace('/');router.refresh();}}>Sign out</button></div>
  </header>
  <nav className="ep-nav" aria-label="Employer sections">{['Hire','Grow','Manage'].map(group=><div key={group}><p>{group}</p><ul>{NAV.filter(n=>n[0]===group).map(([,id,label,icon])=><li key={id}><Link href={`/employer?view=${id}`} aria-current={view===id?'page':undefined}><Icon name={icon}/>{label}</Link></li>)}</ul></div>)}</nav>
  <main className="ep-main" id="main">{body}</main>
 </div>;
}

export function Section({title,sub,actions,children}:{title:string;sub?:string;actions?:ReactNode;children:ReactNode}){
 return <><div className="ep-head"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{actions&&<div className="ep-head-actions">{actions}</div>}</div>{children}</>;
}
