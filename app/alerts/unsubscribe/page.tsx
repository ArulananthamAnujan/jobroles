'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';
import {Brand,Panel,Btn} from '@/components/market-ui';
// Opening the link only shows this page; the alert stops when the button is pressed (mail scanners prefetch links).
function Unsubscribe(){
 const p=useSearchParams(),[state,S]=useState<'idle'|'busy'|'done'|'error'>('idle'),[message,M]=useState('');
 async function confirm(){S('busy');try{const r=await fetch(`/api/alerts/unsubscribe?${new URLSearchParams({id:p.get('id')||'',token:p.get('token')||''})}`,{method:'POST'});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);S('done');}catch(e){M((e as Error).message);S('error');}}
 return <Panel><h1>{state==='done'?'You’re unsubscribed':'Stop this job alert?'}</h1>{state==='done'?<p>You won’t get emails for this saved search any more. Your other alerts are unchanged, and you can turn this one back on in your account.</p>:<><p>We’ll stop emailing you new roles for this saved search.</p><Btn disabled={state==='busy'} onClick={confirm}>{state==='busy'?'Unsubscribing…':'Unsubscribe'}</Btn></>}{state==='error'&&<p role="alert">{message}</p>}<Link className="text-link" href="/job-seeker">Manage alerts in your account</Link></Panel>;
}
export default function Page(){return <><header className="topbar"><Brand/></header><main className="main account-shell"><Suspense><Unsubscribe/></Suspense></main></>;}
