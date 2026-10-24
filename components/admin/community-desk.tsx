'use client';
import {useEffect,useState} from 'react';
import {get,post,when} from '../employer/api';
import {Button,Card,Empty,Notice,Pill} from '../employer/ui';
import {AutoPublish,bulkModerate} from './ops';
type Item={kind:'interview'|'question'|'answer';id:string;company:string;title:string;body:string;extra:string;createdAt:string;flags?:string[]};
const LABEL={interview:'Interview',question:'Question',answer:'Answer'};
// Moderation for interview experiences, company questions and community answers.
export default function CommunityDesk(){
 const [items,I]=useState<Item[]|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[version,V]=useState(0);
 useEffect(()=>{const c=new AbortController();get<{pending:Item[]}>('/api/community',c.signal).then(d=>I(d.pending)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[version]);
 if(!items)return error?<Notice error={error}/>:<p role="status">Loading…</p>;
 const clean=items.filter(x=>!x.flags?.length);
 return <><AutoPublish/><Notice error={error} message={note}/>{clean.length>0&&<div className="ep-actions"><Button disabled={busy} onClick={async()=>{B(true);E('');N('');try{for(const k of ['interview','question','answer'] as const){const ids=clean.filter(x=>x.kind===k).map(x=>x.id);if(ids.length)await bulkModerate(k,ids,'publish','Passed automatic checks; bulk approved');}N(`Published ${clean.length} posts with no flags.`);V(v=>v+1);}catch(err){E((err as Error).message);}finally{B(false);}}}>Publish all {clean.length} without flags</Button></div>}{items.length?items.map(x=><Card key={`${x.kind}-${x.id}`} title={x.title} action={<Pill tone={x.kind==='interview'?'blue':'amber'}>{LABEL[x.kind]}</Pill>}>
  <p className="ep-muted">{x.company} · {when(x.createdAt)}</p>{x.flags?.length?<p>{x.flags.map(f=><Pill key={f} tone="red">{f}</Pill>)}</p>:<p><Pill tone="teal">No flags</Pill></p>}<p className="job-description">{x.body}</p>{x.extra&&<p className="ep-muted">Questions: {x.extra}</p>}
  <form className="ep-actions" style={{marginTop:12}} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const decision=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');B(true);E('');N('');
   try{await post('/api/community',{action:'moderate',kind:x.kind,id:x.id,decision,reason:f.get('reason')});N(decision==='publish'?'Published.':'Rejected.');V(v=>v+1);}catch(err){E((err as Error).message);}finally{B(false);}}}>
   <input name="reason" required minLength={3} maxLength={500} defaultValue="Meets community guidelines" style={{flex:1}} aria-label="Reason"/><Button value="publish" disabled={busy}>Publish</Button><Button value="reject" tone="danger" disabled={busy}>Reject</Button></form>
 </Card>):<Card><Empty title="Nothing awaiting moderation"/></Card>}</>;
}
