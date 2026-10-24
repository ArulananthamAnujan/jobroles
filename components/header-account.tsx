'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
// Shows "Sign in" to visitors and an account menu to signed-in people, like the main job sites do.
export default function HeaderAccount(){
 const [email,E]=useState<string|null|undefined>(undefined),[open,O]=useState(false),ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{let live=true;fetch('/api/account',{cache:'no-store'}).then(r=>r.json()).then((d:{user?:{email:string}|null})=>{if(live)E(d.user?.email??null);}).catch(()=>{if(live)E(null);});return()=>{live=false;};},[]);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))O(false);};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')O(false);};document.addEventListener('click',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',esc);};},[open]);
 if(!email)return <Link href="/job-seeker">Sign in</Link>;
 return <div className="jr-account" ref={ref}><button type="button" aria-expanded={open} aria-haspopup="menu" onClick={()=>O(!open)}><span className="jr-avatar" aria-hidden="true">{email[0]?.toUpperCase()}</span><span className="jr-account-label">My account</span></button>
  {open&&<div className="jr-account-menu" role="menu"><p>{email}</p>
   {[['/job-seeker?view=profile','Profile'],['/job-seeker?view=applications','My applications'],['/job-seeker?view=saved','Saved jobs and searches'],['/resume','Resume builder'],['/assessments','Skills assessments'],['/events','Hiring events'],['/employer','Employer portal'],['/help','Help centre']].map(([h,l])=><Link key={h} role="menuitem" href={h} onClick={()=>O(false)}>{l}</Link>)}
   <button type="button" role="menuitem" onClick={async()=>{await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});window.location.reload();}}>Sign out</button></div>}</div>;
}
