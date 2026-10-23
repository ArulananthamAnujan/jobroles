'use client';
import {useState} from 'react';
import {Btn,Field} from './market-ui';
type Suggestion={name:string;headline:string;location:string;skills:string[]};
// Fills the profile form below from a resume. The person checks the fields and presses Save themselves.
function fill(form:HTMLFormElement,name:string,value:string){const el=form.elements.namedItem(name);if(el instanceof HTMLInputElement&&value){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}}
export default function ResumeAutofill({formId}:{formId:string}){
 const [busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 return <details className="resume-autofill"><summary className="text-link">Fill my profile from my resume</summary>
  <form onSubmit={async e=>{e.preventDefault();B(true);E('');M('');try{const r=await fetch('/api/profile/extract',{method:'POST',body:new FormData(e.currentTarget)});const d=await r.json() as {suggestion?:Suggestion;error?:string};if(!r.ok||!d.suggestion)throw new Error(d.error);const target=document.getElementById(formId);if(target instanceof HTMLFormElement){const s=d.suggestion;fill(target,'name',s.name);fill(target,'headline',s.headline);fill(target,'location',s.location);fill(target,'skills',s.skills.join(', '));}M('We filled in what we found. Check each field, then save your profile.');}catch(err){E((err as Error).message||'Your resume could not be read.');}finally{B(false);}}}>
   <Field label="Resume (PDF or DOCX, up to 10 MB)"><input name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required/></Field>
   <label className="check-row"><input name="consent" type="checkbox" value="yes" required/>Send this file to our AI provider to read it. It is not stored or used for training.</label>
   <Btn secondary disabled={busy}>{busy?'Reading your resume…':'Read my resume'}</Btn>
  </form>{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}</details>;
}
