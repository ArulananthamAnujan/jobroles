'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Btn} from './market-ui';
export default function SaveJob({id}:{id:string}){const [busy,B]=useState(false),[message,M]=useState(''),[login,L]=useState(false);return <div><Btn secondary disabled={busy} onClick={async()=>{B(true);M('');L(false);try{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saved.toggle',payload:{jobId:id,saved:true}})});if(r.status===401){L(true);return;}const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error||'Unable to save job.');M('Saved to your account.');}catch(e){M((e as Error).message);}finally{B(false);}}}>{busy?'Saving…':'Save job'}</Btn>{message&&<p role="status">{message}</p>}{login&&<Link className="text-link" href={`/job-seeker?job=${id}`}>Sign in to save this job</Link>}</div>}
