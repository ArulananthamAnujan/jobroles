'use client';
import {useState} from 'react';
import Captcha,{resetCaptcha} from './captcha';
const TOPICS:[string,string][]=[['account','My account or sign-in'],['application','An application I sent'],['job','A job ad'],['employer','Employer account or job posting'],['billing','Billing or invoices'],['privacy','Privacy or my data'],['report','Report a scam or unsafe job'],['other','Something else']];
// Help-centre contact form; requests go to the JobRoles support queue.
export default function ContactForm(){
 const [done,D]=useState(false),[busy,B]=useState(false),[error,E]=useState('');
 if(done)return <p className="notice" role="status">Thanks. We reply by email within one business day.</p>;
 return <form className="cr-card" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');
  try{const r=await fetch('/api/support',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.get('email'),name:f.get('name')||undefined,topic:f.get('topic'),message:f.get('message'),captcha:f.get('captcha')||undefined})});
   const d=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw new Error(d.error||'Your request could not be sent.');D(true);}catch(err){E((err as Error).message);resetCaptcha();}finally{B(false);}}}>
  <h2 id="contact">Contact us</h2>
  <div className="cr-grid two"><label className="field"><span>Your email</span><input name="email" type="email" required maxLength={254} autoComplete="email"/></label><label className="field"><span>Name (optional)</span><input name="name" maxLength={120} autoComplete="name"/></label></div>
  <label className="field"><span>What do you need help with?</span><select name="topic" required defaultValue=""><option value="" disabled>Choose a topic</option>{TOPICS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
  <label className="field"><span>Tell us what happened</span><textarea name="message" required minLength={20} maxLength={5000} rows={6} placeholder="Include the job title or company if it is about a job. Never send passwords or bank details."/></label>
  <Captcha/>
  {error&&<p role="alert" className="error">{error}</p>}
  <button className="jp-btn" disabled={busy}>{busy?'Sending…':'Send request'}</button>
 </form>;
}
