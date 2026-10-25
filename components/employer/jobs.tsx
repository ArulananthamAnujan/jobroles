'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import ListingAssistant from '../listing-assistant';
import {employerGet,employerPost,command,money,when} from './api';
import {Button,Drawer,Empty,Field,Notice,Pill,Tabs} from './ui';
import {Section,type PortalContext} from './portal';
export type Job={id:string;company_id:string;title:string;state:string;published_at:string|null;expires_at:string|null;created_at:string;description:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string|null;visa_sponsorship:boolean;benefits:string[];start_date:string|null;external_apply_url:string|null;assessment_code?:string|null;job_locations:{label:string}[];screening_questions:{id:string;question:string}[]};
type Stat={job_id:string;views_30d:number;applications:number};
type Question={question:string;mustHave:boolean;expected:'Yes'|'No'};
const STATE:Record<string,[string,'teal'|'amber'|'neutral'|'red'|'blue']>={live:['Live','teal'],pending_review:['Awaiting approval','amber'],draft:['Draft','neutral'],paused:['Paused','blue'],closed:['Closed','neutral'],expired:['Expired','neutral']};
const isExpired=(j:Job)=>j.state==='live'&&!!j.expires_at&&new Date(j.expires_at)<new Date();
const status=(j:Job)=>isExpired(j)?'expired':j.state;
const payText=(j:Pick<Job,'salary_min'|'salary_max'|'salary_period'>)=>j.salary_min!==null&&j.salary_max!==null?`${money(Number(j.salary_min))}–${money(Number(j.salary_max))} per ${j.salary_period}`:'Pay not set';

function Editor({ctx,job,copy,applicants,onClose,onSaved}:{ctx:PortalContext;job:Job|null;copy:boolean;applicants:number;onClose:()=>void;onSaved:(msg:string)=>void}){
 const formRef=useRef<HTMLFormElement>(null);
 const editing=job&&!copy?job:null,source=job;
 const [questions,Q]=useState<Question[]>([{question:'Are you authorised to work in Australia?',mustHave:true,expected:'Yes'}]);
 const [benefits,BF]=useState<string[]>(source?.benefits||[]),[benefit,B1]=useState('');
 const [preview,P]=useState<null|Record<string,string>>(null),[busy,B]=useState(false),[error,E]=useState('');
 const locked=Boolean(editing&&applicants>0);
 const [tests,TS]=useState<{code:string;title:string}[]>([]);
 useEffect(()=>{const c=new AbortController();employerGet<{assessments:{code:string;title:string}[]}>('assessments',{},c.signal).then(d=>TS(d.assessments)).catch(()=>{});return()=>c.abort();},[]);
 useEffect(()=>{if(!source)return;const c=new AbortController();employerGet<{rules:{id:string;must_have:boolean;expected_answer:string}[]}>('rules',{job:source.id},c.signal).then(r=>{const map=new Map(r.rules.map(x=>[x.id,x]));const qs=source.screening_questions.map(q=>({question:q.question,mustHave:map.get(q.id)?.must_have??false,expected:(map.get(q.id)?.expected_answer==='No'?'No':'Yes') as 'Yes'|'No'}));if(qs.length)Q(qs);}).catch(()=>{});return()=>c.abort();},[source]);
 function values(){const f=new FormData(formRef.current!);return Object.fromEntries([...f.entries()].map(([k,v])=>[k,String(v)]));}
 async function save(submit:boolean){
  const f=values();B(true);E('');
  try{
   const saved=await command('job.save',{id:editing?.id,companyId:ctx.company.id,title:f.title,description:f.description,locations:f.location.split('\n').map(x=>x.trim()).filter(Boolean),type:f.type,arrangement:f.arrangement,min:Number(f.min),max:Number(f.max),period:f.period,sponsorship:f.sponsorship==='on',submit}) as {result:{id:string}};
   const id=saved.result.id;
   await employerPost({action:'extras',jobId:id,benefits,startDate:f.startDate||'',externalApplyUrl:f.externalApplyUrl||''});
   await employerPost({action:'job.assessment',jobId:id,code:f.assessment||null});
   if(!locked)await employerPost({action:'screening',jobId:id,questions:questions.filter(q=>q.question.trim().length>=5)});
   onSaved(submit?'Sent for approval. Most jobs are reviewed within one business day.':'Draft saved.');
  }catch(e){E((e as Error).message);}finally{B(false);}
 }
 return <Drawer open wide onClose={onClose} title={editing?`Edit ${editing.title}`:copy?`Copy of ${source?.title}`:'Post a job'}>
  <Notice error={error}/>
  {preview?<div className="ep-preview"><p className="ep-muted">Preview, as job seekers will see it</p><h2 style={{fontSize:24,margin:'6px 0'}}>{preview.title||'Job title'}</h2><p><strong>{ctx.company.name}</strong> · {preview.location?.split('\n')[0]}</p><p style={{fontWeight:700,margin:'6px 0'}}>{payText({salary_min:Number(preview.min),salary_max:Number(preview.max),salary_period:preview.period})} · {preview.type}</p>{benefits.length>0&&<p>Benefits: {benefits.join(' · ')}</p>}{preview.startDate&&<p>Start date: {when(preview.startDate)}</p>}<p className="job-description" style={{marginTop:12}}>{preview.description}</p><h3 style={{marginTop:16}}>Screening questions</h3><ol>{questions.map((q,i)=><li key={i}>{q.question}{q.mustHave&&<Pill tone="amber">Deal-breaker</Pill>}</li>)}</ol><div className="ep-actions" style={{marginTop:16}}><Button tone="secondary" onClick={()=>P(null)}>Back to editing</Button><Button disabled={busy} onClick={()=>save(true)}>Submit for approval</Button></div></div>:null}
  <form ref={formRef} className="ep-form" hidden={Boolean(preview)} onSubmit={e=>{e.preventDefault();P(values());}}>
   <div className="ep-field wide"><ListingAssistant formRef={formRef} companyId={ctx.company.id}/></div>
   <Field label="Job title" wide><input name="title" defaultValue={source?.title} required maxLength={140}/></Field>
   <Field label="Locations" hint="One suburb or city per line, for example Frankston VIC 3199"><textarea name="location" defaultValue={source?.job_locations.map(l=>l.label).join('\n')} required rows={3}/></Field>
   <div className="ep-grid" style={{gap:14}}><Field label="Job type"><select name="type" defaultValue={source?.employment_type||'Full-time'}>{['Full-time','Part-time','Casual','Contract','Temporary','Internship'].map(t=><option key={t}>{t}</option>)}</select></Field>
    <Field label="Work setting"><select name="arrangement" defaultValue={source?.arrangement||'on_site'}><option value="on_site">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></Field></div>
   <Field label="Minimum pay (AUD)"><input name="min" type="number" min="0" step="0.01" defaultValue={source?.salary_min??''} required/></Field>
   <Field label="Maximum pay (AUD)"><input name="max" type="number" min="0" step="0.01" defaultValue={source?.salary_max??''} required/></Field>
   <Field label="Pay period"><select name="period" defaultValue={source?.salary_period||'year'}>{[['year','Per year'],['month','Per month'],['day','Per day'],['hour','Per hour']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
   <Field label="Start date" hint="Optional"><input name="startDate" type="date" defaultValue={source?.start_date||''}/></Field>
   <Field label="Ask applicants to take a skills assessment" hint="Optional. Applicants see the request and you see their level."><select key={tests.length} name="assessment" defaultValue={source?.assessment_code||''}><option value="">No assessment</option>{tests.map(t=><option key={t.code} value={t.code}>{t.title}</option>)}</select></Field>
   <Field label="Job description" wide hint="At least 40 characters. Say what the work is, who it suits and what support people get."><textarea name="description" defaultValue={source?.description} required minLength={40} maxLength={30000} rows={10}/></Field>
   <div className="ep-field wide"><span>Benefits</span><div className="ep-chips">{benefits.map(b=><span key={b}>{b}<button type="button" aria-label={`Remove ${b}`} onClick={()=>BF(benefits.filter(x=>x!==b))}>×</button></span>)}</div>
    <div className="ep-actions"><input value={benefit} onChange={e=>B1(e.target.value)} maxLength={80} placeholder="e.g. Salary packaging" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(benefit.trim()&&benefits.length<20){BF([...benefits,benefit.trim()]);B1('');}}}}/><Button type="button" tone="secondary" size="sm" onClick={()=>{if(benefit.trim()&&benefits.length<20){BF([...benefits,benefit.trim()]);B1('');}}}>Add</Button></div></div>
   <label className="ep-check"><input name="sponsorship" type="checkbox" defaultChecked={source?.visa_sponsorship}/>Visa sponsorship available</label>
   <Field label="Apply on your own website (optional)" wide hint="Leave blank to receive applications in JobRoles, with screening, messages and the applicant board."><input name="externalApplyUrl" type="url" defaultValue={source?.external_apply_url||''} placeholder="https://careers.example.com.au/role"/></Field>
   <div className="ep-field wide"><span>Screening questions</span><small>Yes/no questions applicants must answer. Mark deal-breakers to see at a glance who meets them; no one is rejected automatically.</small>
    {locked&&<p className="ep-notice">Questions are fixed because people have already applied.</p>}
    {questions.map((q,i)=><div className="ep-q" key={i}><input value={q.question} disabled={locked} maxLength={300} aria-label={`Question ${i+1}`} onChange={e=>Q(questions.map((x,k)=>k===i?{...x,question:e.target.value}:x))}/><select value={q.expected} disabled={locked} aria-label="Wanted answer" onChange={e=>Q(questions.map((x,k)=>k===i?{...x,expected:e.target.value as 'Yes'|'No'}:x))}><option value="Yes">Wanted: Yes</option><option value="No">Wanted: No</option></select><label className="ep-check"><input type="checkbox" checked={q.mustHave} disabled={locked} onChange={e=>Q(questions.map((x,k)=>k===i?{...x,mustHave:e.target.checked}:x))}/>Deal-breaker</label><Button type="button" tone="ghost" size="sm" disabled={locked||questions.length===1} onClick={()=>Q(questions.filter((_,k)=>k!==i))}>Remove</Button></div>)}
    {!locked&&questions.length<10&&<Button type="button" tone="secondary" size="sm" onClick={()=>Q([...questions,{question:'',mustHave:false,expected:'Yes'}])}>Add question</Button>}</div>
   <div className="ep-actions"><Button disabled={busy}>Preview</Button><Button type="button" tone="secondary" disabled={busy} onClick={()=>{if(formRef.current?.reportValidity())void save(true);}}>Submit for approval</Button><Button type="button" tone="ghost" disabled={busy} onClick={()=>{if(formRef.current?.reportValidity())void save(false);}}>Save draft</Button></div>
   <p className="ep-muted ep-field wide">Every new or edited job is checked before it goes live. Pay must be the real range for the role.</p>
  </form>
 </Drawer>;
}

export default function Jobs({ctx}:{ctx:PortalContext}){
 const params=useSearchParams();
 const [jobs,J]=useState<Job[]|null>(null),[stats,S]=useState<Stat[]>([]),[tab,T]=useState(params.get('tab')||'all'),[q,Q]=useState(''),[error,E]=useState(''),[note,N]=useState(''),[version,V]=useState(0);
 const [editor,ED]=useState<null|{job:Job|null;copy:boolean}>(params.get('new')?{job:null,copy:false}:null);
 useEffect(()=>{const c=new AbortController();employerGet<{jobs:Job[];stats:Stat[]}>('jobs',{company:ctx.company.id},c.signal).then(d=>{J(d.jobs);S(d.stats);const edit=params.get('edit');if(edit){const j=d.jobs.find(x=>x.id===edit);if(j)ED({job:j,copy:status(j)==='expired'||j.state==='closed'});}}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,version,params]);
 const canEdit=ctx.role==='owner'||ctx.role==='recruiter';
 const counts=useMemo(()=>{const c:Record<string,number>={all:jobs?.length||0};for(const j of jobs||[])c[status(j)]=(c[status(j)]||0)+1;return c;},[jobs]);
 const shown=(jobs||[]).filter(j=>(tab==='all'||status(j)===tab||(tab==='closed'&&status(j)==='expired'))&&j.title.toLowerCase().includes(q.toLowerCase()));
 const stat=(id:string)=>stats.find(s=>s.job_id===id);
 async function setState(j:Job,state:string,msg:string){E('');N('');try{await command('job.state',{id:j.id,state});N(msg);V(v=>v+1);}catch(e){E((e as Error).message);}}
 return <Section title="Jobs" sub="Every listing shows its pay range. New and edited jobs are checked before they go live." actions={canEdit&&<><Link className="ep-btn secondary md" href="/employer?view=import">Import from spreadsheet</Link><Button onClick={()=>ED({job:null,copy:false})}>Post a job</Button></>}>
  <Notice error={error} message={note}/>
  <Tabs value={tab} onChange={T} items={[['all','All',counts.all],['live','Live',counts.live||0],['pending_review','Awaiting approval',counts.pending_review||0],['draft','Drafts',counts.draft||0],['paused','Paused',counts.paused||0],['closed','Closed',(counts.closed||0)+(counts.expired||0)]]}/>
  <div className="ep-toolbar"><input type="search" placeholder="Search jobs" value={q} onChange={e=>Q(e.target.value)} aria-label="Search jobs"/></div>
  {!jobs?<p role="status">Loading jobs…</p>:shown.length?<div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Job</th><th>Status</th><th className="num">Applicants</th><th className="num">Views, 30 days</th><th>Pay</th><th>Closes</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>
   {shown.map(j=>{const st=STATE[status(j)]??[j.state,'neutral'],s=stat(j.id);return <tr key={j.id}>
    <td><div className="ep-row-title">{j.title}</div><div className="ep-row-sub">{j.job_locations.map(l=>l.label).join(', ')} · {j.employment_type}{j.benefits.length?` · ${j.benefits.length} benefits`:''}</div></td>
    <td><Pill tone={st[1]}>{st[0]}</Pill></td>
    <td className="num">{s?<Link href={`/employer?view=applicants&job=${j.id}`}>{s.applications}</Link>:0}</td><td className="num">{s?.views_30d??0}</td>
    <td>{payText(j)}</td><td>{j.expires_at?when(j.expires_at):'–'}</td>
    <td><div className="ep-row-actions">
     <Link className="ep-btn secondary sm" href={`/employer?view=applicants&job=${j.id}`}>Applicants</Link>
     {status(j)==='live'&&<Link className="ep-btn ghost sm" href={`/employer?${new URLSearchParams({view:'candidates',q:j.title,near:j.job_locations[0]?.label||'',title:j.title})}`}>Matches</Link>}
     {canEdit&&(j.state==='closed'||status(j)==='expired'?<Button size="sm" tone="ghost" onClick={()=>ED({job:j,copy:true})}>Repost</Button>:<Button size="sm" tone="ghost" onClick={()=>ED({job:j,copy:false})}>Edit</Button>)}
     {canEdit&&<Button size="sm" tone="ghost" onClick={()=>ED({job:j,copy:true})}>Duplicate</Button>}
     {canEdit&&j.state==='live'&&status(j)!=='expired'&&<Button size="sm" tone="ghost" onClick={()=>setState(j,'paused','Job paused. It no longer appears in search.')}>Pause</Button>}
     {canEdit&&j.state==='paused'&&<Button size="sm" tone="ghost" onClick={()=>setState(j,'pending_review','Sent for approval to go live again.')}>Resume</Button>}
     {canEdit&&!['closed','draft'].includes(j.state)&&<Button size="sm" tone="danger" onClick={()=>{if(window.confirm(`Close “${j.title}”? Applicants keep access to their application.`))void setState(j,'closed','Job closed.');}}>Close</Button>}
     {j.state==='live'&&<Link className="ep-btn ghost sm" href={`/jobs/${j.id}`}>View</Link>}
    </div></td></tr>;})}
  </tbody></table></div>:<div className="ep-card"><Empty title={jobs.length?'No jobs here':'No jobs yet'} action={canEdit&&<Button onClick={()=>ED({job:null,copy:false})}>Post a job</Button>}>{jobs.length?'Try another tab or search.':'Post your first job, or import a spreadsheet of jobs at once.'}</Empty></div>}
  {editor&&<Editor ctx={ctx} job={editor.job} copy={editor.copy} applicants={editor.job?stat(editor.job.id)?.applications??0:0} onClose={()=>ED(null)} onSaved={msg=>{ED(null);N(msg);V(v=>v+1);}}/>}
 </Section>;
}
