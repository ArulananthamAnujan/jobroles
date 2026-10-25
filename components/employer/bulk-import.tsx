'use client';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {employerGet,employerPost,money} from './api';
import {Button,Card,Icon,Notice,Pill,Tabs} from './ui';
import {Section,type PortalContext} from './portal';
import {FIELDS,TYPES,autoMap,duplicates,jobKeys,parseDelimited,problems,readXlsx,templateCsv,toJob,type Field,type JobRow} from '../../lib/spreadsheet';
type Result={saved:number;failed:number;skipped?:number;results:({row:number;ok:true;id:string;state:string}|{row:number;ok:false;error:string;duplicate?:boolean})[]};
type OpenJob={title:string;state:string;expires_at:string|null;job_locations:{label:string}[]};
const MAX=200;
const ARRANGEMENT:Record<string,string>={on_site:'On-site',hybrid:'Hybrid',remote:'Remote'};
function download(name:string,text:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
const csv=(rows:string[][])=>rows.map(r=>r.map(c=>/[",\n\r]/.test(c)?`"${c.replace(/"/g,'""')}"`:c).join(',')).join('\r\n')+'\r\n';

// Import jobs from a spreadsheet in four steps: upload, match columns, check every row, import.
export default function BulkImport({ctx,feeds}:{ctx:PortalContext;feeds:ReactNode}){
 const params=useSearchParams();
 const [tab,T]=useState<'sheet'|'feeds'>(params.get('tab')==='feeds'?'feeds':'sheet');
 return <Section title="Import jobs" sub="Bring many roles across at once from a spreadsheet, or keep them in sync with your applicant tracking system.">
  <Tabs value={tab} onChange={T} items={[['sheet','Spreadsheet'],['feeds','ATS or careers feed']]}/>
  {tab==='sheet'?<Sheet ctx={ctx}/>:feeds}
 </Section>;
}

function Sheet({ctx}:{ctx:PortalContext}){
 const [step,S]=useState(1),[file,F]=useState(''),[table,TB]=useState<string[][]>([]),[map,M]=useState<Partial<Record<Field,number>>>({});
 const [error,E]=useState(''),[busy,B]=useState(false),[over,O]=useState(false),[submit,SU]=useState(true),[filter,FL]=useState<'all'|'fix'|'dup'>('all'),[result,R]=useState<Result|null>(null),[paste,P]=useState('');
 const [edits,ED]=useState<Record<number,JobRow>>({}),[left,LO]=useState<Set<number>>(new Set()),[editing,EG]=useState<number|null>(null),[skipDup,SD]=useState(true),[open,OP]=useState<Set<string>>(new Set()),[sent,ST]=useState<JobRow[]>([]);
 const input=useRef<HTMLInputElement>(null);
 const canImport=ctx.role==='owner'||ctx.role==='recruiter';
 // Jobs the company already has open, so repeats are flagged before anything is sent.
 useEffect(()=>{const c=new AbortController();employerGet<{jobs:OpenJob[]}>('jobs',{company:ctx.company.id},c.signal).then(d=>OP(new Set(d.jobs.filter(j=>['draft','pending_review','live','paused'].includes(j.state)&&(!j.expires_at||new Date(j.expires_at)>new Date())).flatMap(j=>jobKeys(j.title,j.job_locations.map(l=>l.label)))))).catch(()=>{});return()=>c.abort();},[ctx.company.id,result]);
 const headers=table[0]||[],data=table.slice(1);
 const jobs=useMemo(()=>{const list=data.map((cells,i)=>{const job=edits[i]??toJob(cells,map);return {i,cells,job,issues:problems(job),edited:Boolean(edits[i]),out:left.has(i)};});
  const dup=duplicates(list.map(j=>j.out?{title:'',locations:[]}:j.job),open);return list.map((j,k)=>({...j,dup:j.out?null:dup[k]}));},[data,map,edits,left,open]);
 const live=jobs.filter(j=>!j.out),bad=live.filter(j=>j.issues.length),dups=live.filter(j=>!j.issues.length&&j.dup),good=live.filter(j=>!j.issues.length&&!(skipDup&&j.dup));
 function load(name:string,rows:string[][]){
  E('');if(rows.length<2)return E('We couldn’t find any jobs below the heading row. The first row should hold the column names.');
  if(rows.length-1>MAX)return E(`This file has ${rows.length-1} jobs. Import up to ${MAX} at a time: split it into smaller files.`);
  F(name);TB(rows);M(autoMap(rows[0]));ED({});LO(new Set());EG(null);R(null);S(2);
 }
 async function read(f:File){
  E('');try{if(/\.xlsx$/i.test(f.name))load(f.name,await readXlsx(await f.arrayBuffer()));else if(/\.(csv|tsv|txt)$/i.test(f.name))load(f.name,parseDelimited(await f.text()));else if(/\.xls$/i.test(f.name))E('Older .xls files can’t be read. In Excel, choose File › Save As › Excel Workbook (.xlsx) or CSV.');else E('Choose a .csv or .xlsx file.');}
  catch(e){E((e as Error).message||'We couldn’t read that file.');}
 }
 async function run(){
  B(true);E('');try{const rows=good.map(g=>g.job);ST(rows);const r=await employerPost<{result:Result}>({action:'import',companyId:ctx.company.id,submit,skipDuplicates:skipDup,rows});R(r.result);S(4);}catch(e){E((e as Error).message);}finally{B(false);}
 }
 const reset=()=>{S(1);F('');TB([]);M({});ED({});LO(new Set());EG(null);R(null);P('');E('');};
 const fixFile=()=>download('jobs-to-fix.csv',csv([[...headers,'What to fix'],...bad.map(b=>[...headers.map((_,k)=>b.cells[k]??''),b.issues.join('; ')])]));
 if(!canImport)return <Card><p className="ep-muted">Only owners and recruiters can import jobs. Ask an owner of {ctx.company.name} to change your role.</p></Card>;
 return <>
  <ol className="ep-steps">{['Upload','Match columns','Check jobs','Done'].map((l,i)=><li key={l} aria-current={step===i+1?'step':undefined} className={step>i+1?'done':''}><b>{step>i+1?<Icon name="check"/>:i+1}</b>{l}</li>)}</ol>
  <Notice error={error}/>
  {step===1&&<div className="ep-import-grid">
   <div style={{display:'grid',gap:16}}>
    <div className={`ep-drop ${over?'over':''}`} onDragOver={e=>{e.preventDefault();O(true);}} onDragLeave={()=>O(false)} onDrop={e=>{e.preventDefault();O(false);const f=e.dataTransfer.files[0];if(f)void read(f);}}>
     <strong>Drop a spreadsheet here</strong>
     <p>CSV or Excel (.xlsx), up to {MAX} jobs, one job per row with a heading row at the top.</p>
     <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void read(f);e.target.value='';}}/>
     <Button onClick={()=>input.current?.click()}>Choose file</Button>
    </div>
    <Card title="Or paste from Excel or Google Sheets">
     <p className="ep-muted" style={{marginBottom:8,fontSize:13}}>Select the cells including the heading row, copy, and paste them here.</p>
     <textarea value={paste} onChange={e=>P(e.target.value)} rows={5} style={{width:'100%',fontSize:13}} aria-label="Pasted rows" placeholder={'Job title\tLocation\tPay from\t…'}/>
     <div style={{marginTop:8}}><Button tone="secondary" disabled={!paste.trim()} onClick={()=>load('Pasted rows',parseDelimited(paste))}>Use pasted rows</Button></div>
    </Card>
   </div>
   <Card title="Start from our template">
    <p className="ep-muted" style={{fontSize:13,marginBottom:12}}>Your own column names work too: you match them in the next step.</p>
    <ul className="ep-list">{FIELDS.map(([f,l,req])=><li key={f} style={{minHeight:36}}><div className="ep-grow">{l}</div>{req?<Pill>Required</Pill>:<span className="ep-muted" style={{fontSize:12}}>Optional</span>}</li>)}</ul>
    <p className="ep-muted" style={{fontSize:12,margin:'8px 0 12px'}}>Job type is one of {TYPES.join(', ')}. Work setting is On-site, Hybrid or Remote. Separate several locations or benefits with a semicolon. Dates as DD/MM/YYYY.</p>
    <Button tone="secondary" onClick={()=>download('jobroles-jobs-template.csv',templateCsv())}>Download template</Button>
   </Card>
  </div>}

  {step===2&&<div className="ep-import-grid">
   <Card title="Match your columns" action={<span className="ep-muted" style={{fontSize:13}}>{file} · {data.length} {data.length===1?'job':'jobs'}</span>}>
    <div className="ep-mapping">{FIELDS.map(([f,l,req])=>{const v=map[f];return <div key={f} style={{display:'contents'}}>
     <label htmlFor={`map-${f}`}>{l}{req&&<em aria-label="required">*</em>}</label>
     <select id={`map-${f}`} value={v===undefined?'':String(v)} onChange={e=>{const n=e.target.value===''?undefined:Number(e.target.value);M(m=>{const next={...m};if(n===undefined)delete next[f];else next[f]=n;return next;});}}>
      <option value="">{req?'Choose a column':'Not in my file'}</option>{headers.map((h,k)=><option key={k} value={k}>{h||`Column ${k+1}`}</option>)}</select>
     {v!==undefined&&data[0]?.[v]?<small>e.g. {data[0][v]}</small>:null}</div>;})}</div>
   </Card>
   <div style={{display:'grid',gap:16}}>
    <Card title="Before you continue"><p className="ep-muted" style={{fontSize:13}}>We matched {Object.keys(map).length} of {FIELDS.length} fields from your headings. Every required field needs a column. Next you’ll see each job and anything that needs fixing before it can be saved.</p></Card>
    <div className="ep-actions"><Button onClick={()=>S(3)}>Check {data.length} {data.length===1?'job':'jobs'}</Button><Button tone="ghost" onClick={reset}>Choose another file</Button></div>
   </div>
  </div>}

  {step===3&&<>
   <div className="ep-import-sum">
    <strong style={{fontSize:16}}>{good.length} of {jobs.length} ready to import</strong>
    {bad.length>0&&<Pill tone="red">{bad.length} {bad.length===1?'needs':'need'} fixing</Pill>}
    {dups.length>0&&<Pill tone="amber">{dups.length} already open</Pill>}
    {left.size>0&&<Pill>{left.size} left out</Pill>}
    <span style={{flex:1}}/>
    {bad.length>0&&<Button tone="secondary" size="sm" onClick={fixFile}>Download jobs to fix</Button>}
    <Button tone="ghost" size="sm" onClick={()=>S(2)}>Change columns</Button>
   </div>
   {(bad.length>0||dups.length>0)&&<Tabs value={filter} onChange={FL} items={[['all','All jobs',jobs.length],['fix','Needs fixing',bad.length],['dup','Already open',dups.length]]}/>}
   {dups.length>0&&<p className="ep-notice warn">{dups.length===1?'One job matches':`${dups.length} jobs match`} a job you already have open, or an earlier row in this file (same title and location). <label className="ep-check" style={{display:'inline-flex',marginLeft:8}}><input type="checkbox" checked={skipDup} onChange={e=>SD(e.target.checked)}/>Skip these</label></p>}
   <div className="ep-table-wrap"><table className="ep-table ep-import-table"><thead><tr><th className="num">Row</th><th>Job</th><th>Type</th><th>Pay</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>
    {jobs.filter(j=>filter==='all'||(filter==='fix'?!j.out&&j.issues.length>0:!j.out&&!j.issues.length&&j.dup)).map(({i,cells,job,issues,edited,out,dup})=><RowView key={i} i={i} job={job} issues={issues} edited={edited} out={out} dup={dup} skipDup={skipDup}
     editing={editing===i} onEdit={()=>EG(editing===i?null:i)} onSave={j=>{ED(e=>({...e,[i]:j}));EG(null);}} onRevert={()=>{ED(e=>{const n={...e};delete n[i];return n;});EG(null);}} original={toJob(cells,map)}
     onLeave={()=>LO(s=>{const n=new Set(s);if(n.has(i))n.delete(i);else n.add(i);return n;})}/>)}
   </tbody></table></div>
   <Card className="ep-import-go"><div className="ep-import-sum" style={{margin:0}}>
    <div className="ep-seg" role="radiogroup" aria-label="After import">
     <label><input type="radio" name="submit" checked={submit} onChange={()=>SU(true)}/>Submit for approval</label>
     <label><input type="radio" name="submit" checked={!submit} onChange={()=>SU(false)}/>Save as drafts</label></div>
    <span className="ep-muted" style={{fontSize:13,flex:1,minWidth:200}}>{submit?'Each job is checked by our team and goes live once approved, usually the same business day.':'Drafts stay private until you open each one and submit it.'}{bad.length?` ${bad.length} ${bad.length===1?'job needs':'jobs need'} fixing and will be left out unless you fix ${bad.length===1?'it':'them'} here.`:''}</span>
    <Button disabled={busy||!good.length} onClick={run}>{busy?'Importing…':`Import ${good.length} ${good.length===1?'job':'jobs'}`}</Button>
   </div></Card>
  </>}

  {step===4&&result&&<div className="ep-import-grid">
   <Card title={`${result.saved} ${result.saved===1?'job':'jobs'} imported`}>
    <p className="ep-muted" style={{marginBottom:12}}>{submit?'They’re in the approval queue now. You’ll see each one go live on the Jobs page.':'They’re saved as drafts on the Jobs page.'}</p>
    {(result.failed>0||!!result.skipped)&&<><p style={{fontWeight:600,margin:'12px 0 4px'}}>{[result.failed&&`${result.failed} could not be saved`,result.skipped&&`${result.skipped} skipped because you already have ${result.skipped===1?'it':'them'} open`].filter(Boolean).join(' · ')}</p><ul className="ep-list">{result.results.filter(r=>!r.ok).map(r=>{const g=sent[r.row-1];return <li key={r.row}><div className="ep-grow"><strong>{g?.title||`Job ${r.row}`}</strong><small>{'error' in r?r.error:''}</small></div></li>;})}</ul></>}
    <div className="ep-actions" style={{marginTop:16}}><Link className="ep-btn primary md" href={`/employer?view=jobs${submit?'':'&tab=draft'}`}>Go to jobs</Link><Button tone="secondary" onClick={reset}>Import another file</Button>{bad.length>0&&<Button tone="ghost" onClick={fixFile}>Download the {bad.length} to fix</Button>}</div>
   </Card>
   <Card title="Next"><ul className="ep-list">
    <li><div className="ep-grow"><strong>Add screening questions</strong><small>Open any job to add more questions and deal-breakers.</small></div></li>
    <li><div className="ep-grow"><strong>Sponsor your busiest roles</strong><small>Pay per click, only for real visits.</small></div><Link className="ep-btn secondary sm" href="/employer?view=advertising">Sponsor</Link></li>
    <li><div className="ep-grow"><strong>Invite matching candidates</strong><small>People who chose to be found.</small></div><Link className="ep-btn secondary sm" href="/employer?view=candidates">Search</Link></li>
   </ul></Card>
  </div>}
 </>;
}
function payOf(j:JobRow){
 if(j.min===null||j.max===null||Number.isNaN(j.min)||Number.isNaN(j.max))return <span className="ep-muted">–</span>;
 return <>{money(j.min)}–{money(j.max)} <span className="ep-muted">/{j.period==='year'?'yr':j.period==='hour'?'hr':j.period}</span></>;
}

const STATUS=(issues:string[],dup:null|'open'|'file',skip:boolean,out:boolean)=>out?<Pill>Left out</Pill>:issues.length?<Pill tone="red">Fix first</Pill>:dup?<Pill tone="amber">{dup==='open'?'Already open':'Repeated in file'}{skip?' · skip':''}</Pill>:<Pill tone="teal">Ready</Pill>;
function RowView({i,job,issues,edited,out,dup,skipDup,editing,onEdit,onSave,onRevert,onLeave,original}:{i:number;job:JobRow;issues:string[];edited:boolean;out:boolean;dup:null|'open'|'file';skipDup:boolean;editing:boolean;
 onEdit:()=>void;onSave:(j:JobRow)=>void;onRevert:()=>void;onLeave:()=>void;original:JobRow}){
 return <>
  <tr className={!out&&issues.length?'bad':''} style={out?{opacity:.55}:undefined}>
   <td className="num ep-muted">{i+2}</td>
   <td><div className="ep-row-title">{job.title||<span className="ep-muted">No title</span>}{edited&&<span className="ep-muted" style={{fontWeight:400,fontSize:12}}> · edited</span>}</div><div className="ep-row-sub">{job.locations.join(' · ')||'No location'}{job.benefits.length?` · ${job.benefits.length} ${job.benefits.length===1?'benefit':'benefits'}`:''}{job.startDate?` · starts ${job.startDate.split('-').reverse().join('/')}`:''}</div>
    {!out&&issues.length>0&&<ul className="ep-problems">{issues.map(p=><li key={p}>{p}</li>)}</ul>}</td>
   <td>{job.type}{job.arrangement&&<div className="ep-row-sub">{ARRANGEMENT[job.arrangement]??job.arrangement}</div>}</td>
   <td style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{payOf(job)}</td>
   <td>{STATUS(issues,dup,skipDup,out)}</td>
   <td><div className="ep-row-actions">{!out&&<Button size="sm" tone={issues.length?'secondary':'ghost'} aria-expanded={editing} onClick={onEdit}>{issues.length?'Fix':'Edit'}</Button>}<Button size="sm" tone="ghost" onClick={onLeave}>{out?'Include':'Leave out'}</Button></div></td>
  </tr>
  {editing&&<tr className="ep-edit-row"><td/><td colSpan={5}><RowEditor job={job} edited={edited} original={original} onSave={onSave} onRevert={onRevert} onCancel={onEdit}/></td></tr>}
 </>;
}
// Edit one row in place; the problems update as you type, and saving needs none left.
function RowEditor({job,edited,onSave,onRevert,onCancel}:{job:JobRow;edited:boolean;original:JobRow;onSave:(j:JobRow)=>void;onRevert:()=>void;onCancel:()=>void}){
 const [j,J]=useState<JobRow>(job);const set=<K extends keyof JobRow>(k:K,v:JobRow[K])=>J(x=>({...x,[k]:v}));
 const num=(v:string)=>v.trim()===''?null:Number(v.replace(/[$,\s]/g,''));const issues=problems(j);
 return <form className="ep-form" onSubmit={e=>{e.preventDefault();if(!issues.length)onSave(j);}} style={{padding:'4px 0 8px'}}>
  <label className="ep-field"><span>Job title</span><input value={j.title} maxLength={160} onChange={e=>set('title',e.target.value)}/></label>
  <label className="ep-field"><span>Locations</span><input value={j.locations.join('; ')} onChange={e=>set('locations',e.target.value.split(/[;|]/).map(x=>x.trim()).filter(Boolean))}/><small>Separate several with a semicolon</small></label>
  <label className="ep-field"><span>Job type</span><select value={TYPES.includes(j.type)?j.type:''} onChange={e=>set('type',e.target.value)}><option value="" disabled>Choose</option>{TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
  <label className="ep-field"><span>Work setting</span><select value={ARRANGEMENT[j.arrangement]?j.arrangement:''} onChange={e=>set('arrangement',e.target.value)}><option value="" disabled>Choose</option>{Object.entries(ARRANGEMENT).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
  <div className="ep-field"><span>Pay (AUD)</span><div className="ep-money"><input aria-label="Pay from" inputMode="decimal" value={j.min===null||Number.isNaN(j.min)?'':String(j.min)} onChange={e=>set('min',num(e.target.value))}/>–<input aria-label="Pay to" inputMode="decimal" value={j.max===null||Number.isNaN(j.max)?'':String(j.max)} onChange={e=>set('max',num(e.target.value))}/>
   <select aria-label="Pay per" value={j.period} onChange={e=>set('period',e.target.value)} style={{width:'auto'}}>{['hour','day','month','year'].map(p=><option key={p} value={p}>per {p}</option>)}</select></div></div>
  <label className="ep-field"><span>Start date</span><input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(j.startDate)?j.startDate:''} onChange={e=>set('startDate',e.target.value)}/></label>
  <label className="ep-field wide"><span>Description</span><textarea rows={5} value={j.description} maxLength={20000} onChange={e=>set('description',e.target.value)}/><small>{j.description.length} characters · at least 40</small></label>
  {issues.length>0&&<ul className="ep-problems ep-field wide" style={{listStyle:'none',padding:0,margin:0,color:'#831c1e',fontSize:13}}>{issues.map(p=><li key={p}>{p}</li>)}</ul>}
  <div className="ep-actions"><Button disabled={issues.length>0}>Save row</Button><Button type="button" tone="ghost" onClick={onCancel}>Cancel</Button>{edited&&<Button type="button" tone="ghost" onClick={onRevert}>Undo my edits</Button>}</div>
 </form>;
}
