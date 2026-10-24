'use client';
import {useEffect,useState} from 'react';
import {stageName} from '@/lib/stages';
import Link from 'next/link';
import {Panel,Btn,Badge,date} from './market-ui';
type Activity={id:string;applicationId:string;kind:string;text:string;at:string;startsAt?:string;timeZone?:string};
export default function AccountActivity(){const [items,I]=useState<Activity[]>([]),[error,E]=useState(''),[busy,B]=useState(true),[revision,R]=useState(0);
 useEffect(()=>{const c=new AbortController();B(true);E('');fetch('/api/activity',{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {activity:Activity[];error?:string};if(!r.ok)throw new Error(d.error);I(d.activity);}).catch(e=>{if(e.name!=='AbortError')E(e.message);}).finally(()=>{if(!c.signal.aborted)B(false);});return()=>c.abort();},[revision]);
 return <section id="activity"><div className="page-heading"><h2>Recent activity</h2><Btn secondary disabled={busy} onClick={()=>R(n=>n+1)}>Refresh activity</Btn></div><p className="muted">Latest messages, application changes and interviews. We also email you about messages, interviews and application updates.</p>{busy&&<p role="status">Loading activity…</p>}{error&&<p role="alert">{error}</p>}<div className="grid-three">{items.map(i=><Panel key={i.id}><Badge>{i.kind}</Badge><p>{i.kind==='Application update'?stageName(i.text):i.text}</p>{i.startsAt&&<p>{new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:i.timeZone}).format(new Date(i.startsAt))} · {i.timeZone}</p>}<small>{date(i.at)}</small><Link className="text-link" href={`/account/applications/${i.applicationId}`}>Open application</Link></Panel>)}</div>{!items.length&&!busy&&!error&&<p>No activity yet.</p>}</section>;
}
