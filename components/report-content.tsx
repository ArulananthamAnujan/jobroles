'use client';
import {useRef,useState} from 'react';
const REASONS:[string,string][]=[['false','It is false or misleading'],['personal','It names or identifies someone'],['offensive','It is offensive or discriminatory'],['spam','It is spam or advertising'],['conflict','It was written by the employer or a competitor'],['other','Something else']];
// Lets anyone signed in flag a published review, interview, question or answer for a moderator to look at.
export default function ReportContent({kind,id}:{kind:'review'|'interview'|'question'|'answer';id:string}){
 const dialog=useRef<HTMLDialogElement>(null);const [done,D]=useState(''),[error,E]=useState(''),[busy,B]=useState(false);
 return <><button type="button" className="co-report" onClick={()=>{E('');dialog.current?.showModal();}}>Report</button>
  <dialog ref={dialog} className="co-dialog" aria-label="Report this post" onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}>
   {done?<div className="co-dialog-body"><h2>Thanks for telling us</h2><p role="status">{done}</p><button className="jp-btn" onClick={()=>dialog.current?.close()}>Done</button></div>:
   <form className="co-dialog-body" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);B(true);E('');
    try{const r=await fetch('/api/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'report',kind,id,reason:f.get('reason'),details:String(f.get('details')||'')||undefined})});const d=await r.json().catch(()=>({})) as {error?:string};
     if(r.status===401)throw new Error('Sign in to report a post.');if(!r.ok)throw new Error(d.error||'Could not send the report.');D('A moderator will review it. We remove posts that break our guidelines.');}catch(err){E((err as Error).message);}finally{B(false);}}}>
    <div className="co-dialog-head"><h2>What is wrong with this post?</h2><button type="button" className="co-close" aria-label="Close" onClick={()=>dialog.current?.close()}>×</button></div>
    <fieldset className="co-reasons"><legend className="sr-only">Reason</legend>{REASONS.map(([v,l])=><label key={v} className="check"><input type="radio" name="reason" value={v} required/>{l}</label>)}</fieldset>
    <label className="field"><span>Details (optional)</span><textarea name="details" maxLength={1000}/></label>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="row"><button className="jp-btn" disabled={busy}>{busy?'Sending…':'Send report'}</button><button type="button" className="jp-btn secondary" onClick={()=>dialog.current?.close()}>Cancel</button></div>
   </form>}
  </dialog></>;
}
