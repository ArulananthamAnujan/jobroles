'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import {Brand} from '../market-ui';
import AccountWorkspace from '../account-workspace';
import EmailStatus from '../email-status';
import PrivacyCentre from '../privacy-centre';
import ReviewDesk from '../review-desk';
import CommunityDesk from './community-desk';
import {ReportedPosts,ClickQuality,SupportQueue} from './ops';
import {AccountLaunchTools} from '../launch-tools';
import {get,command,money,when} from '../employer/api';
import {Button,Card,Empty,Field,Icon,Notice,Pill} from '../employer/ui';
import '../employer/portal.css';
type Queue={jobs:{id:string;title:string;description:string;employment_type:string;arrangement:string;salary_min:number;salary_max:number;salary_period:string;created_at:string;external_apply_url:string|null;companies:{id:string;name:string;verified_at:string|null};job_locations:{label:string}[]}[];
 companies:{id:string;name:string;abn:string|null;about:string;is_agency:boolean;created_at:string;website:string|null}[];audit:{id:string;action:string;entity_type:string;reason:string;created_at:string}[];risks:{job_id:string;flags:string[]}[]};
const NAV:[string,string,string][]=[['jobs','Job approvals','jobs'],['companies','Employer verification','shield'],['reports','Job reports','bell'],['reviews','Review moderation','star'],['community','Interviews & Q&A','chat'],['flagged','Reported posts','bell'],['support','Support requests','people'],['clicks','Sponsored clicks','chart'],['privacy','Privacy requests','people'],['email','Email delivery','chat'],['audit','Audit log','chart']];
export default function AdminConsole(){
 const params=useSearchParams(),path=usePathname(),view=params.get('view')||'jobs';
 const [state,S]=useState<'loading'|'signin'|'denied'|'ok'>('loading'),[q,Q]=useState<Queue|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[version,V]=useState(0);
 useEffect(()=>{let live=true;get<{user:{confirmed:boolean}|null}>('/api/account').then(async a=>{if(!a.user?.confirmed){if(live)S('signin');return;}try{const d=await get<Queue>('/api/admin/queue');if(live){Q(d);S('ok');}}catch{if(live)S('denied');}}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[version]);
 async function run(fn:()=>Promise<unknown>,done:string){B(true);E('');N('');try{await fn();N(done);V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 if(state==='signin')return <AccountWorkspace portal="employer"/>;
 if(state==='denied')return <div className="ep"><main className="ep-main" style={{gridColumn:'1/-1'}}><Card title="Administrators only"><p>This area is for JobRoles administrators. <Link href="/employer">Go to the employer portal</Link></p></Card></main></div>;
 const risk=(id:string)=>q?.risks.find(r=>r.job_id===id)?.flags||[];
 let body=null;
 if(!q)body=<p role="status">Loading…</p>;
 else if(view==='jobs')body=<>{q.jobs.length?q.jobs.map(j=><Card key={j.id} title={j.title} action={<Pill tone={risk(j.id).length?'amber':'teal'}>{risk(j.id).length?`${risk(j.id).length} risk signals`:'No risk signals'}</Pill>}>
   <p className="ep-muted">{j.companies.name}{!j.companies.verified_at&&' (company not verified)'} · {j.job_locations.map(l=>l.label).join(', ')} · {j.employment_type} · {money(j.salary_min)}–{money(j.salary_max)} per {j.salary_period} · submitted {when(j.created_at)}</p>
   {j.external_apply_url&&<p>Applies on: <a href={j.external_apply_url} target="_blank" rel="noopener noreferrer">{j.external_apply_url}</a></p>}
   {risk(j.id).length>0&&<ul className="ep-notice error" style={{paddingLeft:28}}>{risk(j.id).map(f=><li key={f}>{f}</li>)}</ul>}
   <details><summary>Description</summary><p className="job-description">{j.description}</p></details>
   <form className="ep-actions" style={{marginTop:12}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const decision=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');void run(()=>command('job.review',{id:j.id,decision,reason:f.get('reason')}),decision==='approve'?'Job approved and live.':'Job rejected.');}}>
    <input name="reason" required minLength={3} maxLength={500} placeholder="Reason (recorded in the audit log)" defaultValue="Meets listing guidelines" style={{flex:1}} aria-label="Reason"/><Button value="approve" disabled={busy}>Approve</Button><Button value="reject" tone="danger" disabled={busy}>Reject</Button></form></Card>):<Card><Empty title="No jobs awaiting approval"/></Card>}</>;
 else if(view==='companies')body=<>{q.companies.length?q.companies.map(c=><Card key={c.id} title={c.name} action={c.is_agency?<Pill tone="amber">Agency</Pill>:undefined}>
   <p className="ep-muted">ABN {c.abn||'not supplied'} · registered {when(c.created_at)}{c.website?` · ${c.website}`:''}</p>{c.about&&<p>{c.about}</p>}
   {c.abn&&<p><a href={`https://abr.business.gov.au/ABN/View?abn=${c.abn}`} target="_blank" rel="noopener noreferrer">Check this ABN on the Australian Business Register</a></p>}
   <form className="ep-form" style={{marginTop:12}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>command('company.verify',{id:c.id,abnMatched:f.get('abnMatched')==='on',evidenceType:f.get('evidenceType'),evidenceReference:f.get('evidenceReference'),reason:f.get('reason')}),`${c.name} verified.`);}}>
    <label className="ep-check ep-field wide"><input type="checkbox" name="abnMatched" required/>I matched the ABN to this business on the register</label>
    <Field label="Evidence"><select name="evidenceType"><option value="domain_email">Business domain email</option><option value="business_callback">Call to a listed business number</option><option value="document_review">Document review</option></select></Field>
    <Field label="Evidence reference"><input name="evidenceReference" required minLength={1} maxLength={500}/></Field>
    <Field label="Reason" wide><input name="reason" required minLength={3} maxLength={500} defaultValue="ABN active and matches the business name"/></Field>
    <div className="ep-actions"><Button disabled={busy}>Verify employer</Button></div></form></Card>):<Card><Empty title="No employers awaiting verification"/></Card>}</>;
 else if(view==='reports')body=<AccountLaunchTools isAdmin/>;
 else if(view==='reviews')body=<ReviewDesk companies={[]} ownerOf={[]}/>;
 else if(view==='community')body=<CommunityDesk/>;
 else if(view==='flagged')body=<ReportedPosts/>;
 else if(view==='support')body=<SupportQueue/>;
 else if(view==='clicks')body=<ClickQuality/>;
 else if(view==='privacy')body=<PrivacyCentre isAdmin/>;
 else if(view==='email')body=<EmailStatus/>;
 else body=<div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>{q.audit.map(a=><tr key={a.id}><td>{when(a.created_at,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</td><td>{a.action}</td><td>{a.entity_type}</td><td>{a.reason}</td></tr>)}</tbody></table></div>;
 const title=NAV.find(n=>n[0]===view)?.[1]||'Admin';
 return <div className="ep"><header className="ep-top"><Brand/><span className="ep-tag" style={{background:'#fdecec',color:'#a23535'}}>Admin</span><div className="ep-top-end"><Link href="/employer">Employer portal</Link></div></header>
  <nav className="ep-nav" aria-label="Admin sections"><ul>{NAV.map(([id,label,icon])=><li key={id}><Link href={`${path}?view=${id}`} aria-current={view===id?'page':undefined}><Icon name={icon}/>{label}{id==='jobs'&&q?<span className="ep-count">{q.jobs.length}</span>:id==='companies'&&q?<span className="ep-count">{q.companies.length}</span>:null}</Link></li>)}</ul></nav>
  <main className="ep-main"><div className="ep-head"><div><h1>{title}</h1></div></div><Notice error={error} message={note}/><div className="ep-grid">{body}</div></main></div>;
}
