'use client';
import {useEffect,useState} from 'react';
import {get,post,when} from '../employer/api';
import {Button,Card,Field,Notice,Pill,Stat} from '../employer/ui';
type Row={group:string;title:string;state:'ok'|'attention'|'off'|'check';detail:string;fix?:string};
const LABEL:Record<Row['state'],[string,'teal'|'red'|'neutral'|'amber']>={ok:['Working','teal'],attention:['Needs attention','red'],off:['Not switched on','neutral'],check:['Check by hand','amber']};
// A plain-language check of everything the site depends on: what works, what needs attention and what to do about it.
export default function SetupStatus(){
 const [rows,R]=useState<Row[]|null>(null),[at,A]=useState(''),[error,E]=useState(''),[version,V]=useState(0);
 const [abn,AB]=useState<{connected:boolean}|null>(null),[key,K]=useState(''),[busy,B]=useState(false),[note,N]=useState(''),[keyError,KE]=useState('');
 async function saveKey(value:string){B(true);N('');KE('');try{await post('/api/admin/setup',{abnRegisterKey:value});K('');N(value?'Saved. New companies are now checked against the ABN register.':'Disconnected. Companies are checked by ABN format only.');V(v=>v+1);}catch(e){KE((e as Error).message);}finally{B(false);}}
 useEffect(()=>{let live=true;get<{rows:Row[];checkedAt:string;abnRegister:{connected:boolean}|null}>('/api/admin/setup').then(d=>{if(live){R(d.rows);A(d.checkedAt);AB(d.abnRegister);E('');}}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[version]);
 if(error)return <Notice error={error}/>;
 if(!rows)return <p role="status" className="ep-muted">Checking each part of the site…</p>;
 const count=(s:Row['state'])=>rows.filter(r=>r.state===s).length,groups=[...new Set(rows.map(r=>r.group))];
 return <>
  <div className="ep-stats"><Stat label="Working" value={count('ok')}/><Stat label="Need attention" value={count('attention')} warn={count('attention')>0} hint={count('attention')?'Fix these first':'Nothing urgent'}/><Stat label="Check by hand" value={count('check')} hint="Cannot be read from here"/><Stat label="Not switched on" value={count('off')} hint="Optional or not set up yet"/></div>
  <div className="ep-actions" style={{justifyContent:'space-between',margin:'4px 0 0'}}><span className="ep-muted" style={{fontSize:13}}>Checked {at?when(at,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):''}</span><Button tone="secondary" size="sm" onClick={()=>{R(null);V(v=>v+1);}}>Check again</Button></div>
  {groups.map(g=><Card key={g} title={g}><ul className="ep-list">{rows.filter(r=>r.group===g).map(r=><li key={r.title} style={{alignItems:'flex-start'}}>
   <div className="ep-grow"><strong>{r.title}</strong><small style={{display:'block',whiteSpace:'normal'}}>{r.detail}</small>{r.fix&&r.state!=='ok'&&<small style={{display:'block',whiteSpace:'normal',marginTop:4}}><strong>What to do:</strong> {r.fix}</small>}</div>
   <Pill tone={LABEL[r.state][1]}>{LABEL[r.state][0]}</Pill></li>)}</ul></Card>)}
  {abn&&<Card title="Connect the ABN register"><Notice error={keyError} message={note}/>
   <p className="ep-muted" style={{marginBottom:12}}>{abn.connected?'Connected. Paste a new key to replace it.':'With this connected, a company is verified only when the Australian Business Register says its ABN is active and registered to a matching name.'} The key is free: register at abr.business.gov.au/Tools/WebServices and it is emailed to you.</p>
   <form className="ep-form" onSubmit={e=>{e.preventDefault();void saveKey(key.trim());}}><Field label="ABN Lookup access key (GUID)" hint="Looks like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx. It is stored in your database and never shown again."><input value={key} onChange={e=>K(e.target.value)} required autoComplete="off" spellCheck={false} maxLength={60}/></Field>
    <div className="ep-actions"><Button disabled={busy}>{busy?'Saving…':abn.connected?'Replace key':'Save key'}</Button>{abn.connected&&<Button type="button" tone="danger" disabled={busy} onClick={()=>{if(window.confirm('Disconnect the ABN register? Companies will be checked by ABN format only.'))void saveKey('');}}>Disconnect</Button>}</div></form></Card>}
 </>;
}
