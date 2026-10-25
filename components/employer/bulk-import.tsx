'use client';
import {useMemo,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {employerPost,money} from './api';
import {Button,Card,Icon,Notice,Pill,Tabs} from './ui';
import {Section,type PortalContext} from './portal';
import {FIELDS,TYPES,autoMap,parseDelimited,problems,readXlsx,templateCsv,toJob,type Field,type JobRow} from '../../lib/spreadsheet';
type Result={saved:number;failed:number;results:({row:number;ok:true;id:string;state:string}|{row:number;ok:false;error:string})[]};
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
 const [error,E]=useState(''),[busy,B]=useState(false),[over,O]=useState(false),[submit,SU]=useState(true),[onlyBad,OB]=useState(false),[result,R]=useState<Result|null>(null),[paste,P]=useState('');
 const input=useRef<HTMLInputElement>(null);
 const canImport=ctx.role==='owner'||ctx.role==='recruiter';
 const headers=table[0]||[],data=table.slice(1);
 const jobs=useMemo(()=>data.map((cells,i)=>{const job=toJob(cells,map);return {i,cells,job,issues:problems(job)};}),[data,map]);
 const good=jobs.filter(j=>!j.issues.length),bad=jobs.filter(j=>j.issues.length);
 function load(name:string,rows:string[][]){
  E('');if(rows.length<2)return E('We couldn’t find any jobs below the heading row. The first row should hold the column names.');
  if(rows.length-1>MAX)return E(`This file has ${rows.length-1} jobs. Import up to ${MAX} at a time: split it into smaller files.`);
  F(name);TB(rows);M(autoMap(rows[0]));R(null);S(2);
 }
 async function read(f:File){
  E('');try{if(/\.xlsx$/i.test(f.name))load(f.name,await readXlsx(await f.arrayBuffer()));else if(/\.(csv|tsv|txt)$/i.test(f.name))load(f.name,parseDelimited(await f.text()));else if(/\.xls$/i.test(f.name))E('Older .xls files can’t be read. In Excel, choose File › Save As › Excel Workbook (.xlsx) or CSV.');else E('Choose a .csv or .xlsx file.');}
  catch(e){E((e as Error).message||'We couldn’t read that file.');}
 }
 async function run(){
  B(true);E('');try{const r=await employerPost<{result:Result}>({action:'import',companyId:ctx.company.id,submit,rows:good.map(g=>g.job)});R(r.result);S(4);}catch(e){E((e as Error).message);}finally{B(false);}
 }
 const reset=()=>{S(1);F('');TB([]);M({});R(null);P('');E('');};
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
    {bad.length>0&&<label className="ep-check"><input type="checkbox" checked={onlyBad} onChange={e=>OB(e.target.checked)}/>Show only jobs to fix</label>}
    <span style={{flex:1}}/>
    {bad.length>0&&<Button tone="secondary" size="sm" onClick={fixFile}>Download jobs to fix</Button>}
    <Button tone="ghost" size="sm" onClick={()=>S(2)}>Change columns</Button>
   </div>
   <div className="ep-table-wrap"><table className="ep-table ep-import-table"><thead><tr><th className="num">Row</th><th>Job</th><th>Type</th><th>Pay</th><th>Status</th></tr></thead><tbody>
    {jobs.filter(j=>!onlyBad||j.issues.length).map(({i,job,issues})=><tr key={i} className={issues.length?'bad':''}>
     <td className="num ep-muted">{i+2}</td>
     <td><div className="ep-row-title">{job.title||<span className="ep-muted">No title</span>}</div><div className="ep-row-sub">{job.locations.join(' · ')||'No location'}{job.benefits.length?` · ${job.benefits.length} ${job.benefits.length===1?'benefit':'benefits'}`:''}{job.startDate?` · starts ${job.startDate.split('-').reverse().join('/')}`:''}</div>
      {issues.length>0&&<ul className="ep-problems">{issues.map(p=><li key={p}>{p}</li>)}</ul>}</td>
     <td>{job.type}{job.arrangement&&<div className="ep-row-sub">{ARRANGEMENT[job.arrangement]??job.arrangement}</div>}</td>
     <td style={{whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{payOf(job)}</td>
     <td>{issues.length?<Pill tone="red">Fix first</Pill>:<Pill tone="teal">Ready</Pill>}</td>
    </tr>)}
   </tbody></table></div>
   <Card className="ep-import-go"><div className="ep-import-sum" style={{margin:0}}>
    <div className="ep-seg" role="radiogroup" aria-label="After import">
     <label><input type="radio" name="submit" checked={submit} onChange={()=>SU(true)}/>Submit for approval</label>
     <label><input type="radio" name="submit" checked={!submit} onChange={()=>SU(false)}/>Save as drafts</label></div>
    <span className="ep-muted" style={{fontSize:13,flex:1,minWidth:200}}>{submit?'Each job is checked by our team and goes live once approved, usually the same business day.':'Drafts stay private until you open each one and submit it.'}{bad.length?` Jobs that need fixing are left out; fix them in your file and import them after.`:''}</span>
    <Button disabled={busy||!good.length} onClick={run}>{busy?'Importing…':`Import ${good.length} ${good.length===1?'job':'jobs'}`}</Button>
   </div></Card>
  </>}

  {step===4&&result&&<div className="ep-import-grid">
   <Card title={`${result.saved} ${result.saved===1?'job':'jobs'} imported`}>
    <p className="ep-muted" style={{marginBottom:12}}>{submit?'They’re in the approval queue now. You’ll see each one go live on the Jobs page.':'They’re saved as drafts on the Jobs page.'}</p>
    {result.failed>0&&<><p style={{fontWeight:600,margin:'12px 0 4px'}}>{result.failed} could not be saved</p><ul className="ep-list">{result.results.filter(r=>!r.ok).map(r=>{const g=good[r.row-1];return <li key={r.row}><div className="ep-grow"><strong>{g?.job.title||`Job ${r.row}`}</strong><small>{'error' in r?r.error:''}</small></div></li>;})}</ul></>}
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
