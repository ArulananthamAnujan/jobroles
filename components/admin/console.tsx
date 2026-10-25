'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import AccountWorkspace from '../account-workspace';
import EmailStatus from '../email-status';
import PrivacyCentre from '../privacy-centre';
import ReviewDesk from '../review-desk';
import CommunityDesk from './community-desk';
import {ReportedPosts,ClickQuality,SupportQueue} from './ops';
import {AccountLaunchTools} from '../launch-tools';
import {get,command,money,when} from '../employer/api';
import {Button,Card,Empty,Field,Icon,Notice,Pill,Stat} from '../employer/ui';
import {AppShell,AccountMenu,Section} from '../employer/shell';
import {Bars} from '../employer/bars';
type Queue={jobs:{id:string;title:string;description:string;employment_type:string;arrangement:string;salary_min:number;salary_max:number;salary_period:string;created_at:string;external_apply_url:string|null;companies:{id:string;name:string;verified_at:string|null};job_locations:{label:string}[]}[];
 companies:{id:string;name:string;abn:string|null;about:string;is_agency:boolean;created_at:string;website:string|null}[];audit:{id:string;action:string;entity_type:string;reason:string;created_at:string}[];risks:{job_id:string;flags:string[]}[]};
type Overview={queues:{id:string;count:number;oldest:string|null}[];totals:{liveJobs:number;employers:number;seekers:number;applications7:number};daily:{day:string;applications:number;jobs:number}[]};
const NAV:[string,string,string,string][]=[['','overview','Overview','home'],['Queues','jobs','Job approvals','jobs'],['Queues','companies','Employer verification','shield'],['Queues','reports','Job reports','bell'],['Queues','reviews','Review moderation','star'],['Queues','community','Interviews & Q&A','chat'],['Queues','flagged','Reported posts','bell'],['Queues','support','Support requests','people'],['Platform','clicks','Sponsored clicks','chart'],['Platform','privacy','Privacy requests','people'],['Platform','email','Email delivery','chat'],['Platform','audit','Audit log','chart']];
export default function AdminConsole(){
 const params=useSearchParams(),router=useRouter(),view=params.get('view')||'overview';
 const [state,S]=useState<'loading'|'signin'|'denied'|'ok'>('loading'),[q,Q]=useState<Queue|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[version,V]=useState(0),[o,O]=useState<Overview|null>(null),[email,EM]=useState('');
 useEffect(()=>{let live=true;get<{user:{confirmed:boolean;email:string}|null}>('/api/account').then(async a=>{if(!a.user?.confirmed){if(live)S('signin');return;}try{const [d,ov]=await Promise.all([get<Queue>('/api/admin/queue'),get<{data:Overview}>('/api/admin/ops?resource=overview').then(r=>r.data).catch(()=>null)]);if(live){Q(d);O(ov);EM(a.user.email);S('ok');}}catch{if(live)S('denied');}}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[version]);
 async function run(fn:()=>Promise<unknown>,done:string){B(true);E('');N('');try{await fn();N(done);V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 if(state==='signin')return <AccountWorkspace portal="employer"/>;
 if(state==='denied')return <AppShell nav={[]} current="" crumb="Admin"><Section title="Administrators only" sub="This area is for JobRoles administrators."><Link className="ep-btn secondary md" href="/employer">Go to the employer portal</Link></Section></AppShell>;
 const risk=(id:string)=>q?.risks.find(r=>r.job_id===id)?.flags||[];
 let body=null;
 if(!q)body=<p role="status">Loading…</p>;
 else if(view==='overview')body=<AdminOverview o={o}/>;
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
 const title=NAV.find(n=>n[1]===view)?.[2]||'Admin',count=(id:string)=>o?.queues.find(x=>x.id===id)?.count;
 const nav=NAV.map(([group,id,label,icon])=>({group,id,label,icon,href:`/admin?view=${id}`,count:count(id)}));
 return <AppShell nav={nav} current={view} crumb={<>Admin <span aria-hidden="true">/</span> <strong>{title}</strong></>}
  search={{placeholder:'Search jobs on JobRoles',onSubmit:t=>router.push(`/search?${new URLSearchParams({q:t})}`)}}
  end={<><Link className="ep-iconbtn" href="/help" aria-label="Help"><Icon name="help"/></Link>{email&&<AccountMenu email={email} links={[['/employer','Employer portal'],['/job-seeker','Job seeker view']]}/>}</>}
  foot={<><Link href="/employer">Employer portal</Link><Link href="/">JobRoles home</Link></>}>
  {view==='overview'?<><Notice error={error} message={note}/>{body}</>:<Section title={title}><Notice error={error} message={note}/><div className="ep-grid">{body}</div></Section>}
 </AppShell>;
}

const QUEUE_NAMES:Record<string,string>={jobs:'Jobs awaiting approval',companies:'Employers to verify',reports:'Reported jobs',reviews:'Reviews to moderate',community:'Interviews and Q&A to moderate',flagged:'Reported posts',support:'Open support requests'};
const age=(iso:string|null)=>{if(!iso)return '–';const h=(Date.now()-new Date(iso).getTime())/36e5;return h<1?'Under an hour':h<48?`${Math.round(h)} h`:`${Math.round(h/24)} days`;};
const overDay=(iso:string|null)=>Boolean(iso)&&Date.now()-new Date(iso!).getTime()>864e5;
// The administrator's question: which queue has people waiting, and for how long?
function AdminOverview({o}:{o:Overview|null}){
 if(!o)return <Section title="Platform overview" sub="The overview could not be loaded."><p className="ep-notice warn">This usually means the production database is missing migration 20261027000001_dashboards_import. Apply it with <code>supabase db push --linked</code>. Every queue in the menu still works.</p></Section>;
 const waiting=o.queues.reduce((n,x)=>n+x.count,0),oldest=o.queues.filter(x=>x.oldest).sort((a,b)=>a.oldest!.localeCompare(b.oldest!))[0];
 const sub=waiting?`${waiting} ${waiting===1?'item is':'items are'} waiting${o.queues.filter(x=>x.count).length>1?` across ${o.queues.filter(x=>x.count).length} queues`:''}. The oldest has waited ${age(oldest.oldest)} in “${QUEUE_NAMES[oldest.id]}”.`:'Every queue is clear.';
 return <Section title="Platform overview" sub={sub} actions={oldest&&<Link className="ep-btn primary md" href={`/admin?view=${oldest.id}`}>Open oldest queue</Link>}>
  <div className="ep-grid">
   <div className="ep-stats" style={{marginBottom:0}}>
    <Stat label="Live jobs" value={o.totals.liveJobs.toLocaleString('en-AU')} hint="Approved and not expired"/>
    <Stat label="Verified employers" value={o.totals.employers.toLocaleString('en-AU')} hint="ABN checked"/>
    <Stat label="Job seekers" value={o.totals.seekers.toLocaleString('en-AU')} hint="With a profile"/>
    <Stat label="Applications" value={o.totals.applications7.toLocaleString('en-AU')} hint="Last 7 days"/>
   </div>
   <Card title="Queues">
    <table className="ep-table"><thead><tr><th>Queue</th><th className="num">Waiting</th><th className="num">Oldest</th><th><span className="visually-hidden">Open</span></th></tr></thead><tbody>
     {o.queues.map(x=>{const late=overDay(x.oldest);return <tr key={x.id}><td><Link href={`/admin?view=${x.id}`} className="ep-row-title">{QUEUE_NAMES[x.id]}</Link></td>
      <td className="num" style={x.count?undefined:{color:'var(--soft)'}}>{x.count}</td><td className="num" style={late?{color:'var(--amber)',fontWeight:600}:undefined}>{x.count?age(x.oldest):'–'}</td>
      <td style={{textAlign:'right'}}>{x.count>0&&<Link className="ep-btn secondary sm" href={`/admin?view=${x.id}`}>Open</Link>}</td></tr>;})}
    </tbody></table>
   </Card>
   <div className="ep-grid two">
    <Bars title="Applications per day" days={o.daily.map(d=>({day:d.day,count:d.applications}))} recent={7}/>
    <Bars title="Jobs published per day" unit="jobs" days={o.daily.map(d=>({day:d.day,count:d.jobs}))} recent={7}/>
   </div>
  </div>
 </Section>;
}
