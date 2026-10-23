'use client';
import {useEffect,useState} from 'react';
// Shown to administrators on roles awaiting review.
export default function RiskFlags({id}:{id:string}){
 const [flags,F]=useState<string[]>([]);
 useEffect(()=>{const c=new AbortController();fetch(`/api/job-risk?ids=${id}`,{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():{risks:[]}).then((d:{risks:{flags:string[]}[]})=>F(d.risks[0]?.flags||[])).catch(()=>{});return()=>c.abort();},[id]);
 if(!flags.length)return <p className="muted">No automatic risk signals.</p>;
 return <div role="note" className="notice error"><strong>Check before approving:</strong><ul>{flags.map(f=><li key={f}>{f}</li>)}</ul></div>;
}
