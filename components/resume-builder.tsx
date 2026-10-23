'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {resumePdf,monthLabel,type ResumeData} from '@/lib/resume-pdf';
import './career.css';
type Exp={title:string;company:string;location:string;start:string;end:string;description:string};
type Edu={qualification:string;institution:string;year:string};
type Profile={full_name:string;email:string;headline:string;location:string;skills:string[];summary:string;experience:{title:string;company:string;location?:string|null;start:string;end?:string|null;description?:string|null}[];
 education:{qualification:string;institution:string;year?:number|null}[];licences:string[];languages:string[];desired_titles:string[];desired_pay:number|null;desired_period:string|null;desired_types:string[];ready_to_work:boolean;availability:string};
const TYPES=['Full-time','Part-time','Casual','Contract','Temporary','Internship'];
const blankExp:Exp={title:'',company:'',location:'',start:'',end:'',description:''},blankEdu:Edu={qualification:'',institution:'',year:''};
// Builds the seeker's resume from structured sections, previews it, and saves it as a PDF they can apply with.
export default function ResumeBuilder(){
 const [state,S]=useState<'loading'|'signin'|'noprofile'|'ok'>('loading'),[base,BA]=useState<Profile|null>(null),[email,EM]=useState('');
 const [summary,SU]=useState(''),[exp,EX]=useState<Exp[]>([]),[edu,ED]=useState<Edu[]>([]),[licences,LI]=useState(''),[languages,LA]=useState(''),[titles,TI]=useState(''),[pay,PA]=useState(''),[period,PE]=useState('year'),[types,TY]=useState<string[]>([]),[ready,RE]=useState(false),[availability,AV]=useState('');
 const [busy,B]=useState(''),[error,E]=useState(''),[note,N]=useState('');
 useEffect(()=>{let live=true;fetch('/api/career',{cache:'no-store'}).then(async r=>{if(!live)return;if(r.status===401||r.status===403){S('signin');return;}const d=await r.json() as {profile:Profile|null;email:string};
  if(!d.profile){S('noprofile');return;}const p=d.profile;BA(p);EM(d.email);SU(p.summary||'');EX(p.experience.map(e=>({title:e.title,company:e.company,location:e.location||'',start:e.start,end:e.end||'',description:e.description||''})));
  ED(p.education.map(e=>({qualification:e.qualification,institution:e.institution,year:e.year?String(e.year):''})));LI(p.licences.join('\n'));LA(p.languages.join(', '));TI(p.desired_titles.join(', '));PA(p.desired_pay?String(p.desired_pay):'');PE(p.desired_period||'year');TY(p.desired_types);RE(p.ready_to_work);AV(p.availability||'');S('ok');}).catch(e=>{if(live)E(e.message);});return()=>{live=false;};},[]);
 const list=(v:string,sep:RegExp)=>v.split(sep).map(x=>x.trim()).filter(Boolean);
 const data:ResumeData={name:base?.full_name||'',headline:base?.headline,location:base?.location,email:base?.email||email,summary,skills:base?.skills,
  experience:exp.filter(e=>e.title&&e.company&&e.start).map(e=>({...e,end:e.end||null})),education:edu.filter(e=>e.qualification&&e.institution).map(e=>({...e,year:e.year?Number(e.year):null})),licences:list(licences,/\n/),languages:list(languages,/,/)};
 async function save(){B('save');E('');N('');try{const r=await fetch('/api/career',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'profile',summary,experience:data.experience!.map(e=>({...e,location:e.location||undefined,description:e.description||undefined})),
   education:edu.filter(e=>e.qualification&&e.institution).map(e=>({qualification:e.qualification,institution:e.institution,year:e.year})),licences:data.licences,languages:data.languages,desiredTitles:list(titles,/,/).slice(0,5),desiredPay:pay?Number(pay):null,desiredPeriod:pay?period:null,desiredTypes:types,readyToWork:ready,availability})});
  const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);N('Profile saved. Employers you apply to see your experience, education and licences.');}catch(e){E((e as Error).message||'Could not save.');}finally{B('');}}
 function download(){const blob=new Blob([resumePdf(data) as BlobPart],{type:'application/pdf'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${data.name||'resume'} resume.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 async function useForApplying(){B('upload');E('');N('');try{await save();const form=new FormData();form.append('resume',new File([resumePdf(data) as BlobPart],`${data.name||'resume'} resume.pdf`,{type:'application/pdf'}));
  const r=await fetch('/api/resumes',{method:'POST',body:form});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);N('Saved as a resume. Choose it when you apply, or set it as your default in your profile.');}catch(e){E((e as Error).message||'Could not upload.');}finally{B('');}}
 if(state==='loading')return <p role="status" className="cr-pad">Loading your resume…</p>;
 if(state==='signin')return <div className="cr-pad cr-card"><h1>Build your resume</h1><p>Sign in to build a resume from your experience, then download it or apply with it.</p><Link className="jp-btn" href="/job-seeker">Sign in or create an account</Link></div>;
 if(state==='noprofile')return <div className="cr-pad cr-card"><h1>Build your resume</h1><p>Start by adding your name and headline to your profile.</p><Link className="jp-btn" href="/job-seeker?view=profile">Set up your profile</Link></div>;
 const setExp=(i:number,k:keyof Exp,v:string)=>EX(exp.map((e,j)=>j===i?{...e,[k]:v}:e)),setEdu=(i:number,k:keyof Edu,v:string)=>ED(edu.map((e,j)=>j===i?{...e,[k]:v}:e));
 return <div className="cr-builder">
  <section className="cr-editor">
   <div className="cr-head"><div><h1>Resume builder</h1><p className="muted">Name, headline, location and skills come from <Link className="text-link" href="/job-seeker?view=profile">your profile</Link>.</p></div></div>
   {(error||note)&&<p role={error?'alert':'status'} className={error?'error':'notice'}>{error||note}</p>}
   <fieldset className="cr-box"><legend>Summary</legend><textarea value={summary} onChange={e=>SU(e.target.value)} maxLength={2000} placeholder="Two or three sentences about your experience and what you are looking for." aria-label="Summary"/></fieldset>
   <fieldset className="cr-box"><legend>Work experience</legend>
    {exp.map((e,i)=><div key={i} className="cr-entry"><div className="cr-grid"><label className="field"><span>Job title</span><input value={e.title} onChange={x=>setExp(i,'title',x.target.value)} maxLength={120}/></label><label className="field"><span>Employer</span><input value={e.company} onChange={x=>setExp(i,'company',x.target.value)} maxLength={160}/></label>
     <label className="field"><span>Location</span><input value={e.location} onChange={x=>setExp(i,'location',x.target.value)} maxLength={120}/></label><div className="cr-grid two"><label className="field"><span>Start</span><input type="month" value={e.start} onChange={x=>setExp(i,'start',x.target.value)}/></label><label className="field"><span>End (blank if current)</span><input type="month" value={e.end} onChange={x=>setExp(i,'end',x.target.value)}/></label></div></div>
     <label className="field"><span>What you did</span><textarea value={e.description} onChange={x=>setExp(i,'description',x.target.value)} maxLength={2000}/></label>
     <div className="row"><button type="button" className="text-link" disabled={i===0} onClick={()=>EX(exp.map((x,j)=>j===i-1?exp[i]:j===i?exp[i-1]:x))}>Move up</button><button type="button" className="text-link danger" onClick={()=>EX(exp.filter((_,j)=>j!==i))}>Remove</button></div></div>)}
    {exp.length<20&&<button type="button" className="jp-btn secondary" onClick={()=>EX([...exp,blankExp])}>Add a job</button>}</fieldset>
   <fieldset className="cr-box"><legend>Education</legend>
    {edu.map((e,i)=><div key={i} className="cr-entry cr-grid"><label className="field"><span>Qualification</span><input value={e.qualification} onChange={x=>setEdu(i,'qualification',x.target.value)} maxLength={160}/></label><label className="field"><span>Institution</span><input value={e.institution} onChange={x=>setEdu(i,'institution',x.target.value)} maxLength={160}/></label>
     <label className="field"><span>Year completed</span><input inputMode="numeric" pattern="(19|20)[0-9]{2}" value={e.year} onChange={x=>setEdu(i,'year',x.target.value)} maxLength={4}/></label><button type="button" className="text-link danger" onClick={()=>ED(edu.filter((_,j)=>j!==i))}>Remove</button></div>)}
    {edu.length<10&&<button type="button" className="jp-btn secondary" onClick={()=>ED([...edu,blankEdu])}>Add a qualification</button>}</fieldset>
   <fieldset className="cr-box"><legend>Licences, certifications and languages</legend>
    <label className="field"><span>Licences and certifications (one per line)</span><textarea value={licences} onChange={e=>LI(e.target.value)} placeholder={'Driver licence (C)\nWorking with Children Check\nFirst Aid (HLTAID011)'}/></label>
    <label className="field"><span>Languages (comma separated)</span><input value={languages} onChange={e=>LA(e.target.value)}/></label></fieldset>
   <fieldset className="cr-box"><legend>Job preferences</legend>
    <label className="check"><input type="checkbox" checked={ready} onChange={e=>RE(e.target.checked)}/>I&apos;m ready to work: show employers I can start soon</label>
    <label className="field"><span>Availability</span><input value={availability} onChange={e=>AV(e.target.value)} maxLength={240} placeholder="e.g. Immediately, or two weeks' notice"/></label>
    <label className="field"><span>Desired job titles (comma separated)</span><input value={titles} onChange={e=>TI(e.target.value)}/></label>
    <div className="cr-grid two"><label className="field"><span>Desired minimum pay (AUD)</span><input type="number" min={0} value={pay} onChange={e=>PA(e.target.value)}/></label><label className="field"><span>Per</span><select value={period} onChange={e=>PE(e.target.value)}><option value="year">Year</option><option value="month">Month</option><option value="day">Day</option><option value="hour">Hour</option></select></label></div>
    <div className="cr-types">{TYPES.map(t=><label key={t} className="check"><input type="checkbox" checked={types.includes(t)} onChange={e=>TY(e.target.checked?[...types,t]:types.filter(x=>x!==t))}/>{t}</label>)}</div></fieldset>
   <div className="cr-actions"><button className="jp-btn" disabled={Boolean(busy)} onClick={save}>{busy==='save'?'Saving…':'Save profile'}</button><button className="jp-btn secondary" disabled={Boolean(busy)} onClick={useForApplying}>{busy==='upload'?'Saving…':'Save as a resume to apply with'}</button><button className="jp-btn secondary" onClick={download}>Download PDF</button></div>
  </section>
  <aside className="cr-preview" aria-label="Resume preview"><div className="cr-paper">
   <h2>{data.name}</h2>{data.headline&&<p className="cr-sub">{data.headline}</p>}<p className="cr-contact">{[data.location,data.email].filter(Boolean).join(' · ')}</p>
   {summary&&<><h3>Summary</h3><p>{summary}</p></>}
   {data.experience!.length>0&&<><h3>Experience</h3>{data.experience!.map((e,i)=><div key={i} className="cr-item"><p><strong>{e.title}</strong><span>{monthLabel(e.start)} – {monthLabel(e.end)}</span></p><p className="cr-sub">{[e.company,e.location].filter(Boolean).join(', ')}</p>{e.description&&<p className="preserve">{e.description}</p>}</div>)}</>}
   {data.education!.length>0&&<><h3>Education</h3>{data.education!.map((e,i)=><div key={i} className="cr-item"><p><strong>{e.qualification}</strong><span>{e.year||''}</span></p><p className="cr-sub">{e.institution}</p></div>)}</>}
   {data.skills?.length?<><h3>Skills</h3><p>{data.skills.join(' • ')}</p></>:null}
   {data.licences!.length>0&&<><h3>Licences and certifications</h3><ul>{data.licences!.map(l=><li key={l}>{l}</li>)}</ul></>}
   {data.languages!.length>0&&<><h3>Languages</h3><p>{data.languages!.join(', ')}</p></>}
  </div></aside>
 </div>;
}
