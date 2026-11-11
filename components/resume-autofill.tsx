'use client';
import {useEffect,useState} from 'react';
import {Btn,Field} from './market-ui';
type Suggestion={name:string;headline:string;location:string;skills:string[]};
// Fills the profile form below from a resume. The person checks the fields and presses Save themselves.
function fill(form:HTMLFormElement,name:string,value:string){const el=form.elements.namedItem(name);if(el instanceof HTMLInputElement&&value){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));return true;}return false;}
export default function ResumeAutofill({formId}:{formId:string}){
 const [busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState(''),[ai,A]=useState(false);
 // The site reads the resume itself. AI reading is an extra, offered only where it has been set up.
 useEffect(()=>{let live=true;fetch('/api/profile/extract',{cache:'no-store'}).then(r=>r.json()).then((d:{ai?:boolean})=>{if(live)A(Boolean(d.ai));}).catch(()=>{});return()=>{live=false;};},[]);
 return <details className="resume-autofill"><summary className="text-link">Fill my profile from my resume</summary>
  <form onSubmit={async e=>{e.preventDefault();B(true);E('');M('');try{const r=await fetch('/api/profile/extract',{method:'POST',body:new FormData(e.currentTarget)});const d=await r.json() as {suggestion?:Suggestion;error?:string};if(!r.ok||!d.suggestion)throw new Error(d.error);const target=document.getElementById(formId);const filled:string[]=[];if(target instanceof HTMLFormElement){const s=d.suggestion;if(fill(target,'name',s.name))filled.push('name');if(fill(target,'headline',s.headline))filled.push('headline');if(fill(target,'location',s.location))filled.push('location');if(fill(target,'skills',s.skills.join(', ')))filled.push(`${s.skills.length} ${s.skills.length===1?'skill':'skills'}`);}M(`We filled in your ${filled.join(', ')||'details'}. Check each field, add anything missing, then save your profile.`);}catch(err){E((err as Error).message||'Your resume could not be read. Fill in your profile below.');}finally{B(false);}}}>
   <Field label="Resume (PDF or DOCX, up to 10 MB)"><input name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required/></Field>
   {ai?<label className="check-row"><input name="consent" type="checkbox" value="yes"/>Use AI to read it more accurately. Your file is sent to our AI provider; it is not stored or used for training. Leave unticked to have JobRoles read it without AI.</label>
    :<p className="muted small">Your resume is read on JobRoles only to fill in the form below. It is not saved until you upload it under Resume versions.</p>}
   <Btn secondary disabled={busy}>{busy?'Reading your resume…':'Read my resume'}</Btn>
  </form>{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</details>;
}
