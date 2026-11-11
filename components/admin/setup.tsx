'use client';
import {useEffect,useState} from 'react';
import {get,when} from '../employer/api';
import {Button,Card,Notice,Pill,Stat} from '../employer/ui';
type Row={group:string;title:string;state:'ok'|'attention'|'off'|'check';detail:string;fix?:string};
const LABEL:Record<Row['state'],[string,'teal'|'red'|'neutral'|'amber']>={ok:['Working','teal'],attention:['Needs attention','red'],off:['Not switched on','neutral'],check:['Check by hand','amber']};
// A plain-language check of everything the site depends on: what works, what needs attention and what to do about it.
export default function SetupStatus(){
 const [rows,R]=useState<Row[]|null>(null),[at,A]=useState(''),[error,E]=useState(''),[version,V]=useState(0);
 useEffect(()=>{let live=true;get<{rows:Row[];checkedAt:string}>('/api/admin/setup').then(d=>{if(live){R(d.rows);A(d.checkedAt);E('');}}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[version]);
 if(error)return <Notice error={error}/>;
 if(!rows)return <p role="status" className="ep-muted">Checking each part of the site…</p>;
 const count=(s:Row['state'])=>rows.filter(r=>r.state===s).length,groups=[...new Set(rows.map(r=>r.group))];
 return <>
  <div className="ep-stats"><Stat label="Working" value={count('ok')}/><Stat label="Need attention" value={count('attention')} warn={count('attention')>0} hint={count('attention')?'Fix these first':'Nothing urgent'}/><Stat label="Check by hand" value={count('check')} hint="Cannot be read from here"/><Stat label="Not switched on" value={count('off')} hint="Optional or not set up yet"/></div>
  <div className="ep-actions" style={{justifyContent:'space-between',margin:'4px 0 0'}}><span className="ep-muted" style={{fontSize:13}}>Checked {at?when(at,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):''}</span><Button tone="secondary" size="sm" onClick={()=>{R(null);V(v=>v+1);}}>Check again</Button></div>
  {groups.map(g=><Card key={g} title={g}><ul className="ep-list">{rows.filter(r=>r.group===g).map(r=><li key={r.title} style={{alignItems:'flex-start'}}>
   <div className="ep-grow"><strong>{r.title}</strong><small style={{display:'block',whiteSpace:'normal'}}>{r.detail}</small>{r.fix&&r.state!=='ok'&&<small style={{display:'block',whiteSpace:'normal',marginTop:4}}><strong>What to do:</strong> {r.fix}</small>}</div>
   <Pill tone={LABEL[r.state][1]}>{LABEL[r.state][0]}</Pill></li>)}</ul></Card>)}
 </>;
}
