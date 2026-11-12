'use client';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {Card} from '../employer/ui';
type Checks={resume:boolean;profile:boolean;applied:boolean};
function Step({n,step,title,children,done}:{n:number;step:number;title:string;children:ReactNode;done:boolean}){
 return <li className={`gs-step ${done?'done':step===n?'now':''}`} aria-current={step===n?'step':undefined}>
  <span className="gs-num" aria-hidden="true">{done?'✓':n}</span><div><strong>{title}{done&&<span className="visually-hidden"> (done)</span>}</strong>{step===n&&<div className="gs-body">{children}</div>}</div></li>;
}
// The first-time path for a job seeker, in the order that takes least effort: upload a resume (which fills in the
// profile and the resume builder), check what was filled in, then find a job. It disappears once they have applied.
export default function GetStarted({checks,onChange}:{checks:Checks;onChange:()=>void}){
 const [busy,B]=useState(false),[error,E]=useState(''),[note,N]=useState('');
 if(checks.applied)return null;
 const step=!checks.resume?1:!checks.profile?2:3;
 async function upload(file:File|undefined){
  if(!file)return;B(true);E('');N('');
  try{const form=new FormData();form.append('resume',file);const r=await fetch('/api/resumes',{method:'POST',body:form});const d=await r.json() as {error?:string;filledNote?:string};if(!r.ok)throw new Error(d.error||'The resume could not be uploaded.');
   N(`${file.name} is saved. ${d.filledNote||'Next, check your profile.'}`);onChange();}
  catch(e){E((e as Error).message);}finally{B(false);}
 }
 return <Card title="Get started in three steps">
  {note&&<p className="ep-notice" role="status" style={{position:'static',boxShadow:'none'}}>{note}</p>}{error&&<p className="ep-notice error" role="alert" style={{position:'static',boxShadow:'none'}}>{error}</p>}
  <ol className="gs">
   <Step n={1} step={step} title="Add your resume" done={checks.resume}>
    <p>Upload it and we fill in your profile and work history for you. PDF or Word, up to 10 MB.</p>
    <div className="ep-actions"><label className={`ep-btn primary md ${busy?'busy':''}`}>{busy?'Reading your resume…':'Upload my resume'}<input type="file" hidden accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
     <Link className="ep-btn secondary md" href="/job-seeker?view=resume">I don’t have one: build it here</Link></div>
   </Step>
   <Step n={2} step={step} title="Check your profile" done={checks.profile}>
    <p>Make sure your headline, location and skills are right. Employers see these when you apply.</p>
    <div className="ep-actions"><Link className="ep-btn primary md" href="/job-seeker?view=profile">Check my profile</Link></div>
   </Step>
   <Step n={3} step={step} title="Find a job and apply" done={checks.applied}>
    <p>You’re ready. Search for a role, open it and choose Apply now. Your resume is attached for you.</p>
    <div className="ep-actions"><Link className="ep-btn primary md" href="/search">Find jobs</Link><Link className="ep-btn secondary md" href="/job-seeker?view=resume">Review my resume details</Link></div>
   </Step>
  </ol>
 </Card>;
}
