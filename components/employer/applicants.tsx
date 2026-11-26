'use client';
import {useCallback,useEffect,useMemo,useState,type ReactNode} from 'react';
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
// Match score and search result for each applicant, worked out by the database from the resume text.
type Insight={score?:number;matched?:string[];read?:boolean;hit?:boolean;snippet?:string};
type Insights={terms:string[];waiting:number;applicants:Record<string,Insight>};
// How many cards a board column, or rows the list, shows before "Show more": keeps a job with hundreds of applicants quick.
const COLUMN_STEP=25,LIST_STEP=50;
// A search result excerpt, with the matched words (wrapped in [[ ]] by the database) shown in bold.
function Snippet({text}:{text:string}){const parts=text.split(/\[\[|\]\]/);return <span className="ep-snippet">…{parts.map((x,i)=>i%2?<mark key={i}>{x}</mark>:<span key={i}>{x}</span>)}…</span>;}
function Match({i,full}:{i?:Insight;full?:boolean}){if(!i||typeof i.score!=='number')return null;
 const tone=i.score>=60?'teal':i.score>=30?'blue':'neutral';
 return <span className="ep-match" title={i.matched?.length?`Matches your job’s key words: ${i.matched.join(', ')}`:'None of your job’s key words were found'}><Pill tone={tone}>{i.score}% match</Pill>{full&&i.matched&&i.matched.length>0&&<small>{i.matched.slice(0,5).join(' · ')}</small>}</span>;}
export default function Applicants({ctx}:{ctx:PortalContext}){
 const params=useSearchParams();
 const [jobs,J]=useState<JobLite[]|null>(null),[job,SJ]=useState(params.get('job')||''),[list,L]=useState<Applicant[]|null>(null),[questions,QS]=useState<Question[]>([]);
 const [stage,ST]=useState(params.get('stage')||'all'),[mode,M]=useState<'board'|'list'>('board'),[sort,SO]=useState<'newest'|'match'>('newest'),[ins,INS]=useState<Insights|null>(null),[insFor,IF]=useState(''),[more,MR]=useState<Record<string,number>>({}),[autoList,AL]=useState(''),[onlyMeets,OM]=useState(false),[q,Q]=useState(params.get('q')||''),[age,AG]=useState('');
 const [selected,SEL]=useState<Set<string>>(new Set()),[open,O]=useState(params.get('application')||''),[drag,DR]=useState(''),[over,OV]=useState('');
 const [templates,TP]=useState<Template[]>([]),[bulkStage,BS]=useState('rejected'),[bulkTemplate,BT]=useState(''),[error,E]=useState(''),[note,N]=useState(''),[version,V]=useState(0),[busy,B]=useState(false),[now,NW]=useState(0);
 const canMove=ctx.role==='owner'||ctx.role==='recruiter';
 useEffect(()=>{const c=new AbortController();Promise.all([employerGet<{jobs:JobLite[]}>('jobs',{company:ctx.company.id},c.signal),employerGet<{templates:Template[]}>('templates',{company:ctx.company.id},c.signal)]).then(async([d,t])=>{J(d.jobs);TP(t.templates);
  const app=params.get('application');let pick=params.get('job')||'';
  if(app&&!pick){try{const detail=await get<{application:{job_id:string}}>(`/api/applications/${app}`,c.signal);pick=detail.application.job_id;}catch{}}
  SJ(pick&&d.jobs.some(j=>j.id===pick)?pick:d.jobs.find(j=>j.state==='live')?.id||d.jobs[0]?.id||'');}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,params]);
 const load=useCallback(async(signal?:AbortSignal)=>{if(!job)return;const d=await employerGet<{applicants:Applicant[];questions:Question[]}>('pipeline',{job},signal);NW(Date.now());L(d.applicants);QS(d.questions);},[job]);
 useEffect(()=>{const c=new AbortController();Promise.resolve().then(()=>load(c.signal)).catch(e=>{if(e.name!=='AbortError')E(e.message==='Job access denied'?'You are not assigned to this job yet. Ask your company’s owner to assign you to it from Team.':e.message);});return()=>c.abort();},[load,version]);
 // Match scores and resume search come from the server. They are asked for again shortly after typing stops, and
 // every few seconds while older resumes are still being read.
 const term=q.trim();
 useEffect(()=>{if(!job)return;let live=true,timer:ReturnType<typeof setTimeout>|undefined;
  const ask=()=>employerGet<{insights:Insights|null}>('insights',{job,...(term?{q:term}:{})}).then(d=>{if(!live)return;INS(d.insights);IF(`${job}|${term}`);if(d.insights&&Number(d.insights.waiting)>0)timer=setTimeout(ask,3000);}).catch(()=>{if(live){INS(null);IF(`${job}|${term}`);}});
  timer=setTimeout(ask,term?350:0);return()=>{live=false;clearTimeout(timer);};},[job,term,version]);
 const searched=Boolean(term)&&ins!==null&&insFor===`${job}|${term}`;
 const of=useCallback((id:string)=>ins?.applicants[id],[ins]);
 const filtered=useMemo(()=>{const rows=(list||[]).filter(a=>(!onlyMeets||a.meets_requirements)
   // With a search typed: the database's answer (names, headlines, locations and the resume text). Until it arrives, or on an older database, names and headlines only.
   &&(!term||(searched&&a.state==='submitted'?Boolean(of(a.application_id)?.hit):`${a.full_name} ${a.headline} ${a.location}`.toLowerCase().includes(term.toLowerCase())))
   &&(!age||now-new Date(a.submitted_at).getTime()<AGE[age]*864e5));
  return sort==='match'?[...rows].sort((x,y)=>(of(y.application_id)?.score??-1)-(of(x.application_id)?.score??-1)||Number(y.meets_requirements)-Number(x.meets_requirements)||new Date(y.submitted_at).getTime()-new Date(x.submitted_at).getTime()):rows;},[list,onlyMeets,term,searched,of,age,now,sort]);
 const counts=useMemo(()=>Object.fromEntries(STAGES.map(([k])=>[k,filtered.filter(a=>a.state==='submitted'&&a.stage===k).length])),[filtered]);
 const visible=filtered.filter(a=>stage==='all'?true:stage==='withdrawn'?a.state==='withdrawn':a.state==='submitted'&&a.stage===stage);
 // The order applicants appear in on screen, so Next and Previous in the panel walk through them the same way.
 const order=useMemo(()=>mode==='list'?visible.map(a=>a.application_id):STAGES.flatMap(([k])=>filtered.filter(a=>a.state==='submitted'&&a.stage===k).map(a=>a.application_id)),[mode,visible,filtered]);
 const at=order.indexOf(open),step=useCallback((by:number)=>{const i=order.indexOf(open);const next=order[i+by];if(i>=0&&next)O(next);},[order,open]);
 // Arrow keys move between applicants while the panel is open, unless the person is typing in a box.
 useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable)||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowRight'){e.preventDefault();step(1);}else if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,step]);
 // A job with many applicants opens as a list, which is quicker to scan than a board. Done once for each job.
 useEffect(()=>{if(list&&job&&autoList!==job){Promise.resolve().then(()=>{AL(job);if(list.length>60)M('list');});}},[list,job,autoList]);
 async function move(ids:string[],to:string,message?:string){if(!ids.length)return;B(true);E('');N('');try{if(ids.length===1&&!message)await command('application.move',{id:ids[0],stage:to});else await employerPost({action:'bulk',ids,stage:to,message});N(`${ids.length} ${ids.length===1?'applicant':'applicants'} moved to ${stageLabel(to)}.`);SEL(new Set());V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 // Downloads the applicants as a spreadsheet file, and says so; with nobody to export it says that instead of doing nothing.
 async function exportCsv(){E('');N('');if(!list?.length){N('There are no applicants to export for this job yet.');return;}
  B(true);try{const r=await fetch(`/api/employer/export?job=${job}`,{cache:'no-store'});if(!r.ok)throw new Error((await r.json().catch(()=>({})) as {error?:string}).error||'The export could not be created.');
   const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download=`applicants-${(current?.title||'job').replace(/[^a-z0-9]+/gi,'-').toLowerCase().slice(0,40)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
   N(`Exported ${list.length} ${list.length===1?'applicant':'applicants'}. Check your downloads.`);}catch(e){E((e as Error).message);}finally{B(false);}}
 const toggle=(id:string)=>{const s=new Set(selected);if(s.has(id))s.delete(id);else s.add(id);SEL(s);};
 const card=(a:Applicant)=><div key={a.application_id} className="ep-cand" draggable={canMove&&a.state==='submitted'} aria-pressed={open===a.application_id} onDragStart={()=>DR(a.application_id)} onDragEnd={()=>{DR('');OV('');}} onClick={()=>O(a.application_id)} onKeyDown={e=>{if(e.key==='Enter')O(a.application_id);}} tabIndex={0} role="button">
  <div className="ep-cand-row">{canMove&&<input type="checkbox" checked={selected.has(a.application_id)} onClick={e=>e.stopPropagation()} onChange={()=>toggle(a.application_id)} aria-label={`Select ${a.full_name}`}/>}<Avatar name={a.full_name||'Applicant'} size={24}/><strong>{a.full_name||'Applicant'}</strong>{a.unread>0&&<Pill tone="blue">{a.unread} new</Pill>}</div>
  <span className="ep-muted">{a.headline||'No headline'}{a.location?` · ${a.location}`:''}</span>
  {(sort==='match'||searched)&&<Match i={of(a.application_id)}/>}{searched&&of(a.application_id)?.snippet&&<Snippet text={of(a.application_id)!.snippet!}/>}
  <div className="ep-cand-row">{questions.some(x=>x.must_have)&&(a.meets_requirements?<Pill tone="teal">Meets deal-breakers</Pill>:<Pill tone="amber">Missing a deal-breaker</Pill>)}{a.state==='withdrawn'&&<Pill tone="red">Withdrawn</Pill>}{a.reinstatement_requested&&<Pill tone="amber">Asks to reinstate</Pill>}<span className={a.state==='submitted'&&a.stage==='new'&&now-new Date(a.submitted_at).getTime()>3*864e5?'ep-late':'ep-muted'}>{ago(a.submitted_at)}</span></div>
 </div>;
 const current=jobs?.find(j=>j.id===job);
 const panelTitle:ReactNode=<span className="ep-panel-title"><span>{list?.find(a=>a.application_id===open)?.full_name||'Applicant'}</span>
  {at>=0&&order.length>1&&<span className="ep-panel-nav"><button type="button" onClick={()=>step(-1)} disabled={at<=0} aria-label="Previous applicant" title="Previous applicant (left arrow key)">‹ Previous</button><span aria-live="polite">{at+1} of {order.length}</span><button type="button" onClick={()=>step(1)} disabled={at>=order.length-1} aria-label="Next applicant" title="Next applicant (right arrow key)">Next ›</button></span>}</span>;
 return <Section title="Applicants" sub={current?`${current.title} · ${list?.length??0} ${list?.length===1?'applicant':'applicants'}`:'Choose a job to see its applicants'} actions={job&&<Button tone="secondary" disabled={busy||!list} onClick={()=>void exportCsv()}>Export CSV</Button>}>
  <Notice error={error} message={note}/>
  {jobs&&!jobs.length?<div className="ep-card"><Empty title="No jobs yet" action={<Button onClick={()=>ctx.go('jobs',{new:'1'})}>Post a job</Button>}>Applicants appear here once your first job is live.</Empty></div>:<>
  <div className="ep-toolbar">
   <select value={job} onChange={e=>{SJ(e.target.value);SEL(new Set());L(null);}} aria-label="Job">{(jobs||[]).map(j=><option key={j.id} value={j.id}>{j.title}{j.state!=='live'?` (${j.state.replace('_',' ')})`:''}</option>)}</select>
   <input type="search" placeholder={ins?'Search names and inside resumes, e.g. forklift':'Search name, headline, location'} value={q} onChange={e=>{Q(e.target.value);MR({});}} aria-label="Search applicants and their resumes" style={{minWidth:260}}/>
   <select value={age} onChange={e=>AG(e.target.value)} aria-label="Applied"><option value="">Any time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
   {questions.some(x=>x.must_have)&&<label className="ep-check"><input type="checkbox" checked={onlyMeets} onChange={e=>OM(e.target.checked)}/>Meets all deal-breakers</label>}
   {ins&&<label className="ep-sort">Sort <select value={sort} onChange={e=>SO(e.target.value as 'newest'|'match')} aria-label="Sort applicants"><option value="newest">Newest first</option><option value="match">Best match first</option></select></label>}
   <span className="ep-grow"/>
   <Tabs value={mode} onChange={M} items={[['board','Board'],['list','List']]}/>
  </div>
  {ins&&list&&list.length>0&&(term||sort==='match'||Number(ins.waiting)>0)&&<p className="ep-insight" role="status">
   {Number(ins.waiting)>0&&<><span className="ep-spin" aria-hidden="true"/>Reading {ins.waiting} more {Number(ins.waiting)===1?'resume':'resumes'} so they can be searched and scored. </>}
   {term&&(searched?<>{filtered.filter(a=>a.state==='submitted').length} of {list.filter(a=>a.state==='submitted').length} applicants mention “{term}” in their resume, name, headline or location. </>:<>Searching resumes… </>)}
   {sort==='match'&&ins.terms.length>0&&<>Best match compares each resume with your job’s key words: {ins.terms.slice(0,10).join(', ')}{ins.terms.length>10?` and ${ins.terms.length-10} more`:''}. It is a keyword count, not a judgement of the person.</>}</p>}
  {mode==='list'&&<Tabs value={stage} onChange={ST} items={[['all','All',filtered.length],...STAGES.map(([k,l])=>[k,l,counts[k]] as [string,string,number]),['withdrawn','Withdrawn',filtered.filter(a=>a.state==='withdrawn').length]]}/>}
  {!list?(error?null:<p role="status">Loading applicants…</p>):!list.length?<div className="ep-card"><Empty title="No applicants yet">Share the job or sponsor it to reach more people.</Empty></div>:mode==='board'?
   <div className="ep-board">{STAGES.map(([k,l])=><section key={k} className={`ep-col ${over===k?'over':''}`} aria-label={l} onDragOver={e=>{if(drag){e.preventDefault();OV(k);}}} onDragLeave={()=>OV('')} onDrop={e=>{e.preventDefault();OV('');const ids=selected.has(drag)?[...selected]:[drag];if(drag)void move(ids,k);}}>
    <h3>{l}<span className="ep-count">{counts[k]}</span></h3>{counts[k]?<>{filtered.filter(a=>a.state==='submitted'&&a.stage===k).slice(0,more[k]||COLUMN_STEP).map(card)}{counts[k]>(more[k]||COLUMN_STEP)&&<button type="button" className="ep-show-more" onClick={()=>MR(m=>({...m,[k]:(m[k]||COLUMN_STEP)+COLUMN_STEP}))}>Show {Math.min(COLUMN_STEP,counts[k]-(more[k]||COLUMN_STEP))} more of {counts[k]}</button>}</>:<p className="ep-col-empty">{canMove?'Drag applicants here':'No one at this stage'}</p>}</section>)}</div>
   :<div className="ep-table-wrap"><table className="ep-table"><thead><tr>{canMove&&<th><input type="checkbox" aria-label="Select all" checked={visible.length>0&&visible.every(a=>selected.has(a.application_id))} onChange={e=>SEL(e.target.checked?new Set(visible.map(a=>a.application_id)):new Set())}/></th>}<th>Applicant</th>{ins&&<th>Match</th>}<th>Stage</th><th>Deal-breakers</th><th>Applied</th><th/></tr></thead><tbody>
    {visible.slice(0,more.list||LIST_STEP).map(a=><tr key={a.application_id} className={open===a.application_id?'ep-fresh':undefined}>{canMove&&<td><input type="checkbox" checked={selected.has(a.application_id)} onChange={()=>toggle(a.application_id)} aria-label={`Select ${a.full_name}`}/></td>}<td><div className="ep-row-title">{a.full_name}{a.unread>0&&<> <Pill tone="blue">{a.unread} new</Pill></>}</div><div className="ep-row-sub">{a.headline}{a.location?` · ${a.location}`:''}</div>{searched&&of(a.application_id)?.snippet&&<Snippet text={of(a.application_id)!.snippet!}/>}</td>{ins&&<td><Match i={of(a.application_id)} full/></td>}<td>{a.state==='withdrawn'?<Pill tone="red">Withdrawn</Pill>:<Pill>{stageLabel(a.stage)}</Pill>}</td><td>{questions.some(x=>x.must_have)?(a.meets_requirements?<Pill tone="teal">Meets all</Pill>:<Pill tone="amber">Missing</Pill>):'–'}</td><td>{when(a.submitted_at)}</td><td><div className="ep-row-actions"><Button size="sm" tone="secondary" onClick={()=>O(a.application_id)}>Open</Button></div></td></tr>)}
   </tbody></table>{visible.length>(more.list||LIST_STEP)&&<div className="ep-actions" style={{justifyContent:'center',padding:12}}><Button tone="secondary" size="sm" onClick={()=>MR(m=>({...m,list:(m.list||LIST_STEP)+LIST_STEP}))}>Show {Math.min(LIST_STEP,visible.length-(more.list||LIST_STEP))} more of {visible.length}</Button></div>}</div>}
  {canMove&&selected.size>0&&<div className="ep-bulk" role="region" aria-label="Bulk actions"><strong>{selected.size} selected</strong>
   <label>Move to <select value={bulkStage} onChange={e=>BS(e.target.value)}>{STAGES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label>and send <select value={bulkTemplate} onChange={e=>BT(e.target.value)}><option value="">no message</option>{templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <Button size="sm" disabled={busy} onClick={()=>move([...selected],bulkStage,templates.find(t=>t.id===bulkTemplate)?.body)}>Apply</Button><Button size="sm" tone="ghost" onClick={()=>SEL(new Set())} style={{color:'#fff'}}>Clear</Button>
   {!templates.length&&<span style={{fontSize:13}}>Save message templates in Messages to reuse them here.</span>}</div>}
  </>}
  <Drawer open={Boolean(open)} wide onClose={()=>{O('');V(v=>v+1);}} title={panelTitle}>{open&&<>
   {(()=>{const i=of(open);return i&&typeof i.score==='number'?<p className="ep-panel-match"><Match i={i}/>{i.matched&&i.matched.length>0?<span>Mentions {i.matched.join(', ')}</span>:<span>None of your job’s key words were found in this resume.</span>}</p>:null;})()}
   <Candidate key={open} id={open} ctx={ctx} templates={templates} onChange={()=>V(v=>v+1)}/></>}</Drawer>
 </Section>;
}
