'use client';
import {useEffect,useRef,useState} from 'react';
import {Btn,Field} from './market-ui';
const CATEGORIES:[string,string][]=[['communication','Communication'],['fairness','Fair process'],['speed','Speed of response']];
async function post(body:object){const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as {error?:string;result?:{helpful?:number}};if(r.status===401)throw new Error('Sign in first.');if(!r.ok)throw new Error(d.error||'Something went wrong.');return d.result;}
// Only people who applied to this employer can submit; the server checks, and every review is moderated.
export default function WriteReview({companyId,companyName,label='Write a review',secondary=false,autoOpen=false}:{companyId:string;companyName:string;label?:string;secondary?:boolean;autoOpen?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(autoOpen&&!dialog.current?.open)dialog.current?.showModal();},[autoOpen]);
 const [busy,B]=useState(false),[message,M]=useState(''),[error,E]=useState('');
 return <>
  <button type="button" className={`jp-btn ${secondary?'secondary':''}`} onClick={()=>dialog.current?.showModal()}>{label}</button>
  <dialog ref={dialog} className="co-dialog" aria-labelledby="review-title" onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}>
   {message?<div className="co-dialog-body"><h2 id="review-title">Thanks for your review</h2><p role="status">{message}</p><Btn type="button" onClick={()=>dialog.current?.close()}>Done</Btn></div>:
   <form className="co-dialog-body" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const n=(k:string)=>f.get(k)?Number(f.get(k)):undefined;B(true);E('');
    try{await post({action:'submit',companyId,rating:Number(f.get('rating')),communication:n('communication'),fairness:n('fairness'),speed:n('speed'),title:f.get('title'),pros:f.get('pros'),cons:f.get('cons')});M('Your review will appear once a moderator has checked it. Your name is never shown.');}
    catch(err){E((err as Error).message==='Sign in first.'?'Sign in to review an employer you applied to.':(err as Error).message);}finally{B(false);}}}>
    <div className="co-dialog-head"><h2 id="review-title">Review hiring at {companyName}</h2><button type="button" className="co-close" aria-label="Close" onClick={()=>dialog.current?.close()}>×</button></div>
    <fieldset className="co-stars-input"><legend>Overall rating</legend><div className="co-stars-row">{[5,4,3,2,1].map(n=><label key={n}><input type="radio" name="rating" value={n} required/><span aria-hidden="true">★</span><span className="sr-only">{n} {n===1?'star':'stars'}</span></label>)}</div></fieldset>
    <div className="co-cat-input">{CATEGORIES.map(([k,l])=><Field key={k} label={l}><select name={k} defaultValue=""><option value="">Skip</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} of 5</option>)}</select></Field>)}</div>
    <Field label="Title"><input name="title" required minLength={3} maxLength={120} placeholder="e.g. Clear process, slow feedback"/></Field>
    <Field label="What went well"><textarea name="pros" required minLength={10} maxLength={2000}/></Field>
    <Field label="What could be better"><textarea name="cons" required minLength={10} maxLength={2000}/></Field>
    <p className="muted small">Only people who applied to {companyName} can post. Reviews are anonymous and checked before publishing. Don’t include names or personal details.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="row"><Btn disabled={busy}>{busy?'Sending…':'Submit review'}</Btn><Btn type="button" secondary onClick={()=>dialog.current?.close()}>Cancel</Btn></div>
   </form>}
  </dialog>
 </>;
}
export function HelpfulButton({id,count}:{id:string;count:number}){
 const [n,N]=useState(count),[done,D]=useState(false),[error,E]=useState('');
 return <span className="co-helpful"><button type="button" disabled={done} onClick={async()=>{E('');try{const r=await post({action:'helpful',id});N(r?.helpful??n+1);D(true);}catch(err){E((err as Error).message==='Sign in first.'?'Sign in to vote.':(err as Error).message);}}}>Helpful{n>0?` (${n})`:''}</button>{error&&<small role="alert">{error}</small>}</span>;
}
