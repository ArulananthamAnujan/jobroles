'use client';
import {useState} from 'react';
import {Btn,Field} from './market-ui';
// Only people who applied to this employer can submit; the server checks, and every review is moderated.
export default function WriteReview({companyId,companyName}:{companyId:string;companyName:string}){
 const [open,O]=useState(false),[busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 if(message)return <p role="status" className="notice">{message}</p>;
 if(!open)return <button className="jp-btn secondary" onClick={()=>O(true)}>Review your hiring experience</button>;
 return <form className="review-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');try{const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',companyId,rating:Number(f.get('rating')),title:f.get('title'),pros:f.get('pros'),cons:f.get('cons')})});const d=await r.json() as {error?:string};if(r.status===401)throw new Error('Sign in to review an employer you applied to.');if(!r.ok)throw new Error(d.error);M('Thanks. Your review will appear once a moderator has checked it. Your name is never shown.');}catch(err){E((err as Error).message);}finally{B(false);}}}>
  <h3>Review hiring at {companyName}</h3>
  <fieldset className="stars"><legend>Overall rating</legend>{[5,4,3,2,1].map(n=><label key={n}><input type="radio" name="rating" value={n} required/>{n} {n===1?'star':'stars'}</label>)}</fieldset>
  <Field label="Title"><input name="title" required minLength={3} maxLength={120} placeholder="e.g. Clear process, slow feedback"/></Field>
  <Field label="What went well"><textarea name="pros" required minLength={10} maxLength={2000}/></Field>
  <Field label="What could be better"><textarea name="cons" required minLength={10} maxLength={2000}/></Field>
  <p className="muted">Only people who applied to {companyName} can post. Reviews are anonymous and checked before publishing. Don’t include names or personal details.</p>
  <Btn disabled={busy}>{busy?'Sending…':'Submit review'}</Btn>{error&&<p role="alert">{error}</p>}
 </form>;
}
