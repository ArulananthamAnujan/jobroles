'use client';
import {useRef,useState,type ReactNode} from 'react';
import {Btn,Field} from './market-ui';
async function send(body:object){const r=await fetch('/api/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as {error?:string;result?:{status?:string}};if(r.status===401)throw new Error('Sign in to JobRoles first.');if(r.status===403&&!d.error)throw new Error('Confirm your email first.');if(!r.ok)throw new Error(d.error||'Something went wrong.');return d.result;}
const num=(f:FormData,k:string)=>f.get(k)?Number(f.get(k)):undefined;
const str=(f:FormData,k:string)=>{const v=String(f.get(k)||'').trim();return v||undefined;};
// A button that opens a modal form; on success it shows the thank-you text instead of the form.
function Contribute({label,title,done,secondary=true,build,children}:{label:string;title:string;done:string;secondary?:boolean;build:(f:FormData)=>object;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);const [busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 const close=()=>dialog.current?.close();
 return <>
  <button type="button" className={`jp-btn ${secondary?'secondary':''}`} onClick={()=>{M('');E('');dialog.current?.showModal();}}>{label}</button>
  <dialog ref={dialog} className="co-dialog" aria-label={title} onClick={e=>{if(e.target===dialog.current)close();}}>
   {message?<div className="co-dialog-body"><h2>Thank you</h2><p role="status">{message}</p><Btn type="button" onClick={close}>Done</Btn></div>:
   <form className="co-dialog-body" onSubmit={async e=>{e.preventDefault();B(true);E('');try{const r=await send(build(new FormData(e.currentTarget)));M(r?.status==='published'?'Your answer is live.':done);}catch(err){E((err as Error).message);}finally{B(false);}}}>
    <div className="co-dialog-head"><h2>{title}</h2><button type="button" className="co-close" aria-label="Close" onClick={close}>×</button></div>
    {children}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="row"><Btn disabled={busy}>{busy?'Sending…':'Submit'}</Btn><Btn type="button" secondary onClick={close}>Cancel</Btn></div>
   </form>}
  </dialog></>;
}
function Stars({name,legend,required=false}:{name:string;legend:string;required?:boolean}){
 return <fieldset className="co-stars-input"><legend>{legend}{!required&&<span className="muted small"> (optional)</span>}</legend><div className="co-stars-row">{[5,4,3,2,1].map(n=><label key={n}><input type="radio" name={name} value={n} required={required}/><span aria-hidden="true">★</span><span className="sr-only">{n} {n===1?'star':'stars'}</span></label>)}</div></fieldset>;
}
const ANON='Posts are anonymous and checked before they appear. Don’t include names or personal details.';
export function WorkplaceReview({companyId,companyName,primary=false}:{companyId:string;companyName:string;primary?:boolean}){
 return <Contribute label="Review this company" secondary={!primary} title={`What is it like to work at ${companyName}?`} done="Your review will appear once a moderator has checked it. Your name is never shown."
  build={f=>({action:'workplace',companyId,rating:num(f,'rating'),title:str(f,'title'),pros:str(f,'pros'),cons:str(f,'cons'),jobTitle:str(f,'jobTitle'),status:f.get('status'),location:str(f,'location'),worklife:num(f,'worklife'),pay:num(f,'pay'),security:num(f,'security'),management:num(f,'management'),culture:num(f,'culture'),recommends:f.get('recommends')?f.get('recommends')==='yes':undefined})}>
  <Stars name="rating" legend="Overall rating" required/>
  <div className="co-two"><Field label="Your job title"><input name="jobTitle" required minLength={2} maxLength={120}/></Field>
   <Field label="Employment"><select name="status" required defaultValue=""><option value="" disabled>Choose</option><option value="current">I work here now</option><option value="former">I used to work here</option></select></Field></div>
  <Field label="Location"><input name="location" maxLength={120} placeholder="e.g. Frankston VIC"/></Field>
  <div className="co-cats-grid"><Stars name="worklife" legend="Work-life balance"/><Stars name="pay" legend="Pay and benefits"/><Stars name="security" legend="Job security and advancement"/><Stars name="management" legend="Management"/><Stars name="culture" legend="Culture"/></div>
  <Field label="Would you recommend working here to a friend?"><select name="recommends" defaultValue=""><option value="">Prefer not to say</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
  <Field label="Review title"><input name="title" required minLength={3} maxLength={120} placeholder="e.g. Great team, tight rosters"/></Field>
  <Field label="Pros"><textarea name="pros" required minLength={10} maxLength={2000}/></Field>
  <Field label="Cons"><textarea name="cons" required minLength={10} maxLength={2000}/></Field>
  <p className="muted small">{ANON}</p>
 </Contribute>;
}
export function ShareInterview({companyId,companyName}:{companyId:string;companyName:string}){
 return <Contribute label="Share an interview" title={`Your interview at ${companyName}`} done="Thanks. Your interview will appear once a moderator has checked it."
  build={f=>({action:'interview',companyId,jobTitle:str(f,'jobTitle'),experience:f.get('experience'),difficulty:num(f,'difficulty'),outcome:f.get('outcome'),source:str(f,'source'),duration:str(f,'duration'),process:str(f,'process'),month:str(f,'month'),questions:String(f.get('questions')||'').split('\n').map(q=>q.trim()).filter(Boolean).slice(0,10)})}>
  <div className="co-two"><Field label="Job title"><input name="jobTitle" required minLength={2} maxLength={120}/></Field><Field label="When"><input name="month" type="month"/></Field></div>
  <div className="co-two"><Field label="How was it?"><select name="experience" required defaultValue=""><option value="" disabled>Choose</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select></Field>
   <Field label="Difficulty"><select name="difficulty" required defaultValue=""><option value="" disabled>Choose</option><option value="1">1 · Very easy</option><option value="2">2 · Easy</option><option value="3">3 · Average</option><option value="4">4 · Hard</option><option value="5">5 · Very hard</option></select></Field></div>
  <div className="co-two"><Field label="Outcome"><select name="outcome" required defaultValue=""><option value="" disabled>Choose</option><option value="offer_accepted">Got an offer and accepted</option><option value="offer_declined">Got an offer and declined</option><option value="no_offer">No offer</option><option value="waiting">Still waiting</option></select></Field>
   <Field label="How long did it take?"><select name="duration" defaultValue=""><option value="">Not sure</option><option value="days">A few days</option><option value="1-2 weeks">1–2 weeks</option><option value="3-4 weeks">3–4 weeks</option><option value="1-2 months">1–2 months</option><option value="longer">Longer</option></select></Field></div>
  <Field label="How did you apply?"><select name="source" defaultValue=""><option value="">Prefer not to say</option><option value="applied_online">Applied online</option><option value="recruiter">Through a recruiter</option><option value="referral">Employee referral</option><option value="other">Other</option></select></Field>
  <Field label="Describe the process" hint="Stages, who you met, how long each part took."><textarea name="process" required minLength={30} maxLength={3000}/></Field>
  <Field label="Questions you were asked" hint="One per line, up to 10."><textarea name="questions" maxLength={3100}/></Field>
  <p className="muted small">{ANON}</p>
 </Contribute>;
}
export function AddSalary({companyId,companyName}:{companyId?:string;companyName?:string}){
 return <Contribute label="Add your salary" title={companyName?`Your pay at ${companyName}`:'Add your salary'} done="Thanks. Salaries show as a range once at least three people have shared pay for the same job, so yours can’t be singled out."
  build={f=>({action:'salary',companyId,jobTitle:str(f,'jobTitle'),pay:num(f,'pay'),period:f.get('period'),location:str(f,'location'),type:str(f,'type'),experience:str(f,'experience')})}>
  <Field label="Job title"><input name="jobTitle" required minLength={2} maxLength={120}/></Field>
  <div className="co-two"><Field label="Base pay (AUD, before tax)"><input name="pay" type="number" required min={15} max={1000000} step="0.01" inputMode="decimal"/></Field>
   <Field label="Per"><select name="period" defaultValue="year"><option value="year">Year</option><option value="month">Month</option><option value="day">Day</option><option value="hour">Hour</option></select></Field></div>
  <div className="co-two"><Field label="Job type"><select name="type" defaultValue=""><option value="">Not saying</option><option>Full-time</option><option>Part-time</option><option>Casual</option><option>Contract</option></select></Field>
   <Field label="Experience"><select name="experience" defaultValue=""><option value="">Not saying</option><option value="0-1">Less than 1 year</option><option value="1-3">1–3 years</option><option value="3-5">3–5 years</option><option value="5-10">5–10 years</option><option value="10+">More than 10 years</option></select></Field></div>
  <Field label="Location"><input name="location" maxLength={120} placeholder="e.g. Melbourne VIC"/></Field>
  <p className="muted small">Salaries are anonymous and only shown as part of a range.</p>
 </Contribute>;
}
export function AskQuestion({companyId,companyName}:{companyId:string;companyName:string}){
 return <Contribute label="Ask a question" secondary={false} title={`Ask about ${companyName}`} done="Your question will appear once a moderator has checked it. We’ll show answers from the employer and people who work there."
  build={f=>({action:'question',companyId,question:str(f,'question')})}>
  <Field label="Your question" hint="e.g. What are the rosters like for new graduates?"><textarea name="question" required minLength={10} maxLength={300}/></Field>
  <p className="muted small">Questions are anonymous. Don’t include names or personal details.</p>
 </Contribute>;
}
export function AnswerQuestion({questionId,question}:{questionId:string;question:string}){
 return <Contribute label="Answer" title="Answer this question" done="Your answer will appear once a moderator has checked it."
  build={f=>({action:'answer',questionId,answer:str(f,'answer')})}>
  <p><strong>{question}</strong></p>
  <Field label="Your answer"><textarea name="answer" required minLength={10} maxLength={1500}/></Field>
  <p className="muted small">Answers are anonymous unless you answer as the employer from an owner or recruiter account.</p>
 </Contribute>;
}
