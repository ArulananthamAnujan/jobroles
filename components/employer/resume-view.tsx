'use client';
import {useEffect,useState} from 'react';
import {Button} from './ui';
// An applicant's resume, readable inside their panel so a recruiter never has to download a file to judge someone.
// The text of the resume is shown straight away. "Open original" shows the real document in a new browser tab
// (PDFs open in the browser's own viewer; Word files are downloaded, as browsers cannot display them).
type Text={filename:string;kind:'pdf'|'docx'|'other';text:string};
export default function ResumeView({id,name}:{id:string;name:string}){
 const [r,R]=useState<Text|null>(null),[error,E]=useState(''),[tall,T]=useState(false),[busy,B]=useState(false);
 useEffect(()=>{let live=true;Promise.resolve().then(()=>{if(live){R(null);E('');T(false);}});
  fetch(`/api/resumes/${id}?view=text`,{cache:'no-store'}).then(async res=>{const d=await res.json().catch(()=>({})) as Text&{error?:string};if(!res.ok)throw new Error(d.error||'The resume could not be opened.');if(live)R(d);}).catch(e=>{if(live)E((e as Error).message);});
  return()=>{live=false;};},[id]);
 async function original(){B(true);E('');
  // Opened before the file arrives so the browser treats it as the person's own click, not a pop-up.
  const tab=r?.kind==='pdf'?window.open('about:blank','_blank'):null;
  try{const res=await fetch(`/api/resumes/${id}`,{cache:'no-store'});if(!res.ok)throw new Error((await res.json().catch(()=>({})) as {error?:string}).error||'The resume could not be opened.');
   const blob=await res.blob(),url=URL.createObjectURL(r?.kind==='pdf'?new Blob([blob],{type:'application/pdf'}):blob);
   if(tab){tab.location.href=url;}else{const a=document.createElement('a');a.href=url;a.download=r?.filename||'resume';document.body.appendChild(a);a.click();a.remove();}
   setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(e){tab?.close();E((e as Error).message);}finally{B(false);}}
 return <section className="ep-section ep-resume-view"><h3>Resume{r?.filename?<span className="ep-muted" style={{fontWeight:400,fontSize:13}}> · {r.filename}</span>:null}</h3>
  {error&&<p className="ep-notice error" role="alert" style={{position:'static'}}>{error}</p>}
  {!r&&!error&&<p className="ep-muted" role="status">Opening {name ? `${name.split(' ')[0]}’s` : 'the'} resume…</p>}
  {r&&(r.text?<><div className={`ep-resume-text ${tall?'tall':''}`} tabIndex={0} aria-label="Resume text">{r.text}</div>
    {r.text.length>900&&<button type="button" className="ep-linkish" onClick={()=>T(!tall)}>{tall?'Show less':'Show the whole resume'}</button>}</>
   :<p className="ep-muted">This resume has no text we can show here (it is probably a scanned image). Use Open original to read it.</p>)}
  <div className="ep-actions" style={{marginTop:10}}><Button size="sm" tone="secondary" disabled={busy||!r} onClick={()=>void original()}>{busy?'Opening…':r?.kind==='pdf'?'Open original in a new tab':'Download original'}</Button>
   {r?.kind==='pdf'&&<a className="ep-btn ghost sm" href={`/api/resumes/${id}`}>Download</a>}</div>
 </section>;
}
