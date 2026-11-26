'use client';
import {useEffect,useRef,useState} from 'react';
// The site's own yes/no question, used instead of the browser's pop-up box. It looks like the rest of the site, can be
// read by screen readers and testing tools, closes with Escape, and always opens above any open panel.
//   if(await ask('Delete this draft? This cannot be undone.')) …
type Question={message:string;resolve:(yes:boolean)=>void};
let open:((q:Question)=>void)|null=null;
export function ask(message:string):Promise<boolean>{
 // Before the page has finished loading there is nothing to show the question in: fall back to the browser's own.
 if(!open)return Promise.resolve(typeof window!=='undefined'&&window.confirm(message));
 return new Promise(resolve=>open!({message,resolve}));
}
// The button says what will happen ("Yes, delete") when the question starts with a plain verb.
const VERBS:Record<string,string>={delete:'Yes, delete',remove:'Yes, remove',cancel:'Yes, cancel it',close:'Yes, close it',discard:'Yes, discard',erase:'Yes, erase',withdraw:'Yes, withdraw',disconnect:'Yes, disconnect',replace:'Yes, replace'};
export default function ConfirmHost(){
 const [q,Q]=useState<Question|null>(null),ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{open=next=>Q(prev=>{prev?.resolve(false);return next;});return()=>{open=null;};},[]);
 useEffect(()=>{const d=ref.current;if(!d)return;if(q&&!d.open)d.showModal();if(!q&&d.open)d.close();},[q]);
 const answer=(yes:boolean)=>{q?.resolve(yes);Q(null);};
 const first=q?.message.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,'')||'',danger=first in VERBS;
 const [lead,...rest]=(q?.message||'').split('\n\n');
 return <dialog ref={ref} className="jr-ask" aria-labelledby="jr-ask-q" onCancel={e=>{e.preventDefault();answer(false);}} onClick={e=>{if(e.target===ref.current)answer(false);}}>
  {q&&<div className="jr-ask-box"><p id="jr-ask-q" className="jr-ask-q">{lead}</p>{rest.map((r,i)=><p key={i} className="jr-ask-more">{r}</p>)}
   <div className="jr-ask-actions"><button type="button" className="jr-ask-no" onClick={()=>answer(false)} autoFocus>No, go back</button><button type="button" className={`jr-ask-yes ${danger?'danger':''}`} onClick={()=>answer(true)}>{VERBS[first]||'Yes, continue'}</button></div></div>}
 </dialog>;
}
