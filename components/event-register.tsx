'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
// Register or cancel for a hiring event; registrants see the online joining link.
export default function EventRegister({eventId,full,past}:{eventId:string;full:boolean;past:boolean}){
 const [me,M]=useState<{registered:boolean;joinUrl:string|null}|null>(null),[signedIn,S]=useState(true),[busy,B]=useState(false),[error,E]=useState('');
 useEffect(()=>{let live=true;fetch(`/api/events/${eventId}`,{cache:'no-store'}).then(async r=>{if(!live)return;if(r.status===401||r.status===403){S(false);return;}const d=await r.json() as {registered:boolean;joinUrl:string|null};M(d);}).catch(()=>{});return()=>{live=false;};},[eventId]);
 async function set(attend:boolean){B(true);E('');try{const r=await fetch('/api/career',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'event.register',eventId,attend})});const d=await r.json() as {result?:{registered:boolean;joinUrl:string|null};error?:string};if(!r.ok)throw new Error(d.error);M({registered:attend,joinUrl:d.result?.joinUrl??null});}catch(e){E((e as Error).message||'Could not update.');}finally{B(false);}}
 if(past)return <p className="muted">This event has finished.</p>;
 if(!signedIn)return <Link className="jp-btn" href="/job-seeker">Sign in to register</Link>;
 return <div className="row">{me?.registered?<><span className="jp-verified">You’re registered</span>{me.joinUrl&&<a className="jp-btn" href={me.joinUrl} target="_blank" rel="noopener noreferrer">Join online</a>}<button className="text-link" disabled={busy} onClick={()=>set(false)}>Cancel registration</button></>
  :<button className="jp-btn" disabled={busy||!me||full} onClick={()=>set(true)}>{full?'Event full':busy?'Registering…':'Register'}</button>}{error&&<p role="alert" className="error">{error}</p>}</div>;
}
