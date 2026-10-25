'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {employerGet,employerPost,command,get,STAGES,stageLabel,ago,when} from './api';
import {Avatar,Button,Drawer,Empty,Notice,Pill,Tabs} from './ui';
import {Section,type PortalContext} from './portal';
import Candidate from './candidate';
type JobLite={id:string;title:string;state:string};
export type Applicant={application_id:string;stage:string;state:string;submitted_at:string;full_name:string;headline:string;location:string;email:string;answers:Record<string,string>;meets_requirements:boolean;unread:number;resume_version_id:string;reinstatement_requested:boolean};
export type Question={id:string;question:string;must_have?:boolean;expected_answer?:string};
type Template={id:string;name:string;body:string};
const AGE:Record<string,number>={'1':1,'7':7,'30':30};
export default function Applicants({ctx}:{ctx:PortalContext}){
 const params=useSearchParams();
 const [jobs,J]=useState<JobLite[]|null>(null),[job,SJ]=useState(params.get('job')||''),[list,L]=useState<Applicant[]|null>(null),[questions,QS]=useState<Question[]>([]);
 const [stage,ST]=useState(params.get('stage')||'all'),[mode,M]=useState<'board'|'list'>('board'),[onlyMeets,OM]=useState(false),[q,Q]=useState(params.get('q')||''),[age,AG]=useState('');
 const [selected,SEL]=useState<Set<string>>(new Set()),[open,O]=useState(params.get('application')||''),[drag,DR]=useState(''),[over,OV]=useState('');
 const [templates,TP]=useState<Template[]>([]),[bulkStage,BS]=useState('rejected'),[bulkTemplate,BT]=useState(''),[error,E]=useState(''),[note,N]=useState(''),[version,V]=useState(0),[busy,B]=useState(false),[now,NW]=useState(0);
 const canMove=ctx.role==='owner'||ctx.role==='recruiter';
 useEffect(()=>{const c=new AbortController();Promise.all([employerGet<{jobs:JobLite[]}>('jobs',{company:ctx.company.id},c.signal),employerGet<{templates:Template[]}>('templates',{company:ctx.company.id},c.signal)]).then(async([d,t])=>{J(d.jobs);TP(t.templates);
  const app=params.get('application');let pick=params.get('job')||'';
  if(app&&!pick){try{const detail=await get<{application:{job_id:string}}>(`/api/applications/${app}`,c.signal);pick=detail.application.job_id;}catch{}}
  SJ(pick&&d.jobs.some(j=>j.id===pick)?pick:d.jobs.find(j=>j.state==='live')?.id||d.jobs[0]?.id||'');}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,params]);
 const load=useCallback(async(signal?:AbortSignal)=>{if(!job)return;const d=await employerGet<{applicants:Applicant[];questions:Question[]}>('pipeline',{job},signal);NW(Date.now());L(d.applicants);QS(d.questions);},[job]);
 useEffect(()=>{const c=new AbortController();Promise.resolve().then(()=>load(c.signal)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[load,version]);
 const filtered=useMemo(()=>(list||[]).filter(a=>(!onlyMeets||a.meets_requirements)&&(!q||`${a.full_name} ${a.headline} ${a.location}`.toLowerCase().includes(q.toLowerCase()))&&(!age||now-new Date(a.submitted_at).getTime()<AGE[age]*864e5)),[list,onlyMeets,q,age,now]);
 const counts=useMemo(()=>Object.fromEntries(STAGES.map(([k])=>[k,filtered.filter(a=>a.state==='submitted'&&a.stage===k).length])),[filtered]);
 const visible=filtered.filter(a=>stage==='all'?true:stage==='withdrawn'?a.state==='withdrawn':a.state==='submitted'&&a.stage===stage);
 async function move(ids:string[],to:string,message?:string){if(!ids.length)return;B(true);E('');N('');try{if(ids.length===1&&!message)await command('application.move',{id:ids[0],stage:to});else await employerPost({action:'bulk',ids,stage:to,message});N(`${ids.length} ${ids.length===1?'applicant':'applicants'} moved to ${stageLabel(to)}.`);SEL(new Set());V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 const toggle=(id:string)=>{const s=new Set(selected);if(s.has(id))s.delete(id);else s.add(id);SEL(s);};
 const card=(a:Applicant)=><div key={a.application_id} className="ep-cand" draggable={canMove&&a.state==='submitted'} aria-pressed={open===a.application_id} onDragStart={()=>DR(a.application_id)} onDragEnd={()=>{DR('');OV('');}} onClick={()=>O(a.application_id)} onKeyDown={e=>{if(e.key==='Enter')O(a.application_id);}} tabIndex={0} role="button">
  <div className="ep-cand-row">{canMove&&<input type="checkbox" checked={selected.has(a.application_id)} onClick={e=>e.stopPropagation()} onChange={()=>toggle(a.application_id)} aria-label={`Select ${a.full_name}`}/>}<Avatar name={a.full_name||'Applicant'} size={24}/><strong>{a.full_name||'Applicant'}</strong>{a.unread>0&&<Pill tone="blue">{a.unread} new</Pill>}</div>
  <span className="ep-muted">{a.headline||'No headline'}{a.location?` · ${a.location}`:''}</span>
  <div className="ep-cand-row">{questions.some(x=>x.must_have)&&(a.meets_requirements?<Pill tone="teal">Meets deal-breakers</Pill>:<Pill tone="amber">Missing a deal-breaker</Pill>)}{a.state==='withdrawn'&&<Pill tone="red">Withdrawn</Pill>}{a.reinstatement_requested&&<Pill tone="amber">Asks to reinstate</Pill>}<span className={a.state==='submitted'&&a.stage==='new'&&now-new Date(a.submitted_at).getTime()>3*864e5?'ep-late':'ep-muted'}>{ago(a.submitted_at)}</span></div>
 </div>;
 const current=jobs?.find(j=>j.id===job);
 return <Section title="Applicants" sub={current?`${current.title} · ${list?.length??0} ${list?.length===1?'applicant':'applicants'}`:'Choose a job to see its applicants'} actions={job&&<a className="ep-btn secondary md" href={`/api/employer/export?job=${job}`}>Export CSV</a>}>
  <Notice error={error} message={note}/>
  {jobs&&!jobs.length?<div className="ep-card"><Empty title="No jobs yet" action={<Button onClick={()=>ctx.go('jobs',{new:'1'})}>Post a job</Button>}>Applicants appear here once your first job is live.</Empty></div>:<>
  <div className="ep-toolbar">
   <select value={job} onChange={e=>{SJ(e.target.value);SEL(new Set());L(null);}} aria-label="Job">{(jobs||[]).map(j=><option key={j.id} value={j.id}>{j.title}{j.state!=='live'?` (${j.state.replace('_',' ')})`:''}</option>)}</select>
   <input type="search" placeholder="Search name, headline, location" value={q} onChange={e=>Q(e.target.value)} aria-label="Search applicants"/>
   <select value={age} onChange={e=>AG(e.target.value)} aria-label="Applied"><option value="">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
   {questions.some(x=>x.must_have)&&<label className="ep-check"><input type="checkbox" checked={onlyMeets} onChange={e=>OM(e.target.checked)}/>Meets all deal-breakers</label>}
   <span className="ep-grow"/>
   <Tabs value={mode} onChange={M} items={[['board','Board'],['list','List']]}/>
  </div>
  {mode==='list'&&<Tabs value={stage} onChange={ST} items={[['all','All',filtered.length],...STAGES.map(([k,l])=>[k,l,counts[k]] as [string,string,number]),['withdrawn','Withdrawn',filtered.filter(a=>a.state==='withdrawn').length]]}/>}
  {!list?<p role="status">Loading applicants…</p>:!list.length?<div className="ep-card"><Empty title="No applicants yet">Share the job or sponsor it to reach more people.</Empty></div>:mode==='board'?
   <div className="ep-board">{STAGES.map(([k,l])=><section key={k} className={`ep-col ${over===k?'over':''}`} aria-label={l} onDragOver={e=>{if(drag){e.preventDefault();OV(k);}}} onDragLeave={()=>OV('')} onDrop={e=>{e.preventDefault();OV('');const ids=selected.has(drag)?[...selected]:[drag];if(drag)void move(ids,k);}}>
    <h3>{l}<span className="ep-count">{counts[k]}</span></h3>{counts[k]?filtered.filter(a=>a.state==='submitted'&&a.stage===k).map(card):<p className="ep-col-empty">{canMove?'Drag applicants here':'No one at this stage'}</p>}</section>)}</div>
   :<div className="ep-table-wrap"><table className="ep-table"><thead><tr>{canMove&&<th><input type="checkbox" aria-label="Select all" checked={visible.length>0&&visible.every(a=>selected.has(a.application_id))} onChange={e=>SEL(e.target.checked?new Set(visible.map(a=>a.application_id)):new Set())}/></th>}<th>Applicant</th><th>Stage</th><th>Deal-breakers</th><th>Applied</th><th/></tr></thead><tbody>
    {visible.map(a=><tr key={a.application_id}>{canMove&&<td><input type="checkbox" checked={selected.has(a.application_id)} onChange={()=>toggle(a.application_id)} aria-label={`Select ${a.full_name}`}/></td>}<td><div className="ep-row-title">{a.full_name}{a.unread>0&&<> <Pill tone="blue">{a.unread} new</Pill></>}</div><div className="ep-row-sub">{a.headline}{a.location?` · ${a.location}`:''}</div></td><td>{a.state==='withdrawn'?<Pill tone="red">Withdrawn</Pill>:<Pill>{stageLabel(a.stage)}</Pill>}</td><td>{questions.some(x=>x.must_have)?(a.meets_requirements?<Pill tone="teal">Meets all</Pill>:<Pill tone="amber">Missing</Pill>):'–'}</td><td>{when(a.submitted_at)}</td><td><div className="ep-row-actions"><Button size="sm" tone="secondary" onClick={()=>O(a.application_id)}>Open</Button></div></td></tr>)}
   </tbody></table></div>}
  {canMove&&selected.size>0&&<div className="ep-bulk" role="region" aria-label="Bulk actions"><strong>{selected.size} selected</strong>
   <label>Move to <select value={bulkStage} onChange={e=>BS(e.target.value)}>{STAGES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label>and send <select value={bulkTemplate} onChange={e=>BT(e.target.value)}><option value="">no message</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <Button size="sm" disabled={busy} onClick={()=>move([...selected],bulkStage,templates.find(t=>t.id===bulkTemplate)?.body)}>Apply</Button><Button size="sm" tone="ghost" onClick={()=>SEL(new Set())} style={{color:'#fff'}}>Clear</Button>
   {!templates.length&&<span style={{fontSize:13}}>Save message templates in Messages to reuse them here.</span>}</div>}
  </>}
  <Drawer open={Boolean(open)} wide onClose={()=>{O('');V(v=>v+1);}} title={list?.find(a=>a.application_id===open)?.full_name||'Applicant'}>{open&&<Candidate id={open} ctx={ctx} templates={templates} onChange={()=>V(v=>v+1)}/>}</Drawer>
 </Section>;
}
