'use client';
import {useCallback,useEffect,useState} from 'react';
import {get,post,money,when} from '../employer/api';
import {Button,Card,Empty,Field,Notice,Pill,Stat} from '../employer/ui';
async function load<T>(resource:string,signal?:AbortSignal){return (await get<{data:T}>(`/api/admin/ops?resource=${resource}`,signal)).data;}
const act=(body:object)=>post('/api/admin/ops',body);
function useResource<T>(resource:string){
 const [data,D]=useState<T|null>(null),[error,E]=useState(''),[version,V]=useState(0);
 useEffect(()=>{const c=new AbortController();load<T>(resource,c.signal).then(D).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[resource,version]);
 return {data,error,reload:useCallback(()=>V(v=>v+1),[])};
}
const REASON:Record<string,string>={false:'False or misleading',personal:'Identifies someone',offensive:'Offensive',spam:'Spam',conflict:'Conflict of interest',other:'Other'};
// Published posts that people reported: keep them or take them down.
export function ReportedPosts(){
 const {data,error,reload}=useResource<{kind:string;id:string;reports:number;reasons:string[];details:string[]|null;lastAt:string;text:string|null}[]>('reports');const [note,N]=useState(''),[err,E]=useState('');
 if(!data)return error?<Notice error={error}/>:<p role="status">Loading…</p>;
 return <><Notice error={err} message={note}/>{data.length?data.map(r=><Card key={`${r.kind}-${r.id}`} title={`${r.kind[0].toUpperCase()}${r.kind.slice(1)} · ${r.reports} ${r.reports===1?'report':'reports'}`} action={<Pill tone="amber">{r.reasons.map(x=>REASON[x]||x).join(', ')}</Pill>}>
  <p className="job-description">{r.text||'(already removed)'}</p>{r.details?.length?<p className="ep-muted">Reporter notes: {r.details.join(' · ')}</p>:null}<p className="ep-muted">Last reported {when(r.lastAt)}</p>
  <form className="ep-actions" style={{marginTop:12}} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const remove=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='remove';E('');N('');
   try{await act({action:'resolve',kind:r.kind,id:r.id,remove,reason:f.get('reason')});N(remove?'Post taken down.':'Reports dismissed; post kept.');reload();}catch(x){E((x as Error).message);}}}>
   <input name="reason" required minLength={3} maxLength={500} defaultValue="Checked against community guidelines" style={{flex:1}} aria-label="Reason"/><Button value="keep" tone="secondary">Keep post</Button><Button value="remove" tone="danger">Take down</Button></form></Card>)
  :<Card><Empty title="No reported posts"/></Card>}</>;
}
// Sponsored-click quality per employer over 7 days, with refunds.
export function ClickQuality(){
 const {data,error,reload}=useResource<{companyId:string;company:string;clicks:number;invalid:number;spent:number;balance:number}[]>('clicks');const [note,N]=useState(''),[err,E]=useState('');
 if(!data)return error?<Notice error={error}/>:<p role="status">Loading…</p>;
 const total=data.reduce((n,r)=>n+r.spent,0);
 return <><Notice error={err} message={note}/><div className="ep-stats"><Stat label="Charged clicks, 7 days" value={data.reduce((n,r)=>n+Number(r.clicks),0)}/><Stat label="Filtered as invalid" value={data.reduce((n,r)=>n+Number(r.invalid),0)}/><Stat label="Click revenue, 7 days" value={money(total/100)}/></div>
  {data.length?<div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Employer</th><th className="num">Charged</th><th className="num">Invalid</th><th className="num">Spent</th><th className="num">Balance</th><th>Refund</th></tr></thead><tbody>
   {data.map(r=><tr key={r.companyId}><td>{r.company}</td><td className="num">{r.clicks}</td><td className="num">{Number(r.invalid)>0?<Pill tone="amber">{r.invalid}</Pill>:0}</td><td className="num">{money(r.spent/100)}</td><td className="num">{money(r.balance/100)}</td>
    <td><form className="ep-actions" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);E('');N('');try{await act({action:'refund',companyId:r.companyId,amount:Math.round(Number(f.get('amount'))*100),reason:f.get('reason')});N(`Refunded ${r.company}.`);reload();(e.target as HTMLFormElement).reset();}catch(x){E((x as Error).message);}}}>
     <label className="ep-money"><span>$</span><input name="amount" type="number" min={0.01} step={0.01} required aria-label={`Refund amount for ${r.company}`}/></label><input name="reason" required minLength={3} placeholder="Reason" aria-label="Refund reason" style={{width:160}}/><Button size="sm" tone="secondary">Refund</Button></form></td></tr>)}
  </tbody></table></div>:<Card><Empty title="No sponsored clicks in the last 7 days"/></Card>}</>;
}
const TOPIC:Record<string,string>={account:'Account',application:'Application',job:'A job ad',employer:'Employer account',billing:'Billing',privacy:'Privacy',report:'Report a problem',other:'Other'};
// Help-centre requests: reply by email, then mark answered or closed.
export function SupportQueue(){
 const {data,error,reload}=useResource<{id:string;email:string;name:string|null;topic:string;message:string;status:string;admin_note:string|null;created_at:string}[]>('support');const [err,E]=useState('');
 if(!data)return error?<Notice error={error}/>:<p role="status">Loading…</p>;
 return <><Notice error={err}/>{data.length?data.map(t=><Card key={t.id} title={`${TOPIC[t.topic]||t.topic} · ${t.name||t.email}`} action={<Pill tone={t.status==='open'?'amber':'teal'}>{t.status}</Pill>}>
  <p className="job-description">{t.message}</p><p className="ep-muted">{t.email} · {when(t.created_at)}</p>
  <form className="ep-actions" style={{marginTop:12}} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const status=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');E('');try{await act({action:'ticket',id:t.id,status,note:String(f.get('note')||'')});reload();}catch(x){E((x as Error).message);}}}>
   <a className="ep-btn primary sm" href={`mailto:${t.email}?subject=${encodeURIComponent('Your JobRoles request')}`}>Reply by email</a><input name="note" defaultValue={t.admin_note||''} placeholder="Internal note" style={{flex:1}} aria-label="Internal note"/><Button size="sm" tone="secondary" value="answered">Mark answered</Button><Button size="sm" tone="ghost" value="closed">Close</Button></form></Card>)
  :<Card><Empty title="No open requests"/></Card>}</>;
}
// Auto-publishing clean posts saves moderator time; flagged posts and brand-new accounts still wait.
export function AutoPublish(){
 const {data,reload}=useResource<{autoPublishClean:boolean}>('settings');const [err,E]=useState('');
 if(!data)return null;
 return <Card title="Automatic publishing"><Notice error={err}/><Field label="Publish posts that pass every automatic check" wide><label className="ep-check"><input type="checkbox" checked={data.autoPublishClean} onChange={async e=>{E('');try{await act({action:'autopublish',enabled:e.target.checked});reload();}catch(x){E((x as Error).message);}}}/>{data.autoPublishClean?'On: clean reviews, interviews, questions and answers go live at once':'Off: every post waits for a moderator'}</label></Field>
  <p className="ep-muted">Checks look for contact details, links, offensive language, serious allegations, shouting and copied text. Posts from accounts less than a day old always wait. Anyone can report a published post.</p></Card>;
}
export async function bulkModerate(kind:string,ids:string[],decision:'publish'|'reject',reason:string){return act({action:'bulk',kind,ids,decision,reason});}
