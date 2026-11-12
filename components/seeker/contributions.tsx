'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {get,post,when} from '../employer/api';
import {Button,Card,Empty,Notice,Pill} from '../employer/ui';
import {Section} from '../employer/shell';
type Item={id:string;companyId:string|null;company:string|null;title:string;status?:string;reason?:string|null;rating?:number;kind?:string;pay?:number;period?:string;location?:string|null;createdAt:string};
type Data={reviews:Item[];salaries:Item[];interviews:Item[];questions:Item[];answers:Item[]};
const GROUPS:[keyof Data,'review'|'salary'|'interview'|'question'|'answer',string,string][]=[['reviews','review','Reviews','review'],['salaries','salary','Salaries you shared','salary'],['interviews','interview','Interview experiences','interview experience'],['questions','question','Questions you asked','question'],['answers','answer','Answers you gave','answer']];
const STATUS:Record<string,[string,'teal'|'amber'|'red']>={published:['Published','teal'],pending:['Being checked','amber'],rejected:['Not published','red']};
// Everything the person has written about employers, in one place, with a way to remove each one.
export default function Contributions(){
 const [data,D]=useState<Data|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(''),[version,V]=useState(0);
 useEffect(()=>{let live=true;get<{data:Data}>('/api/manage?resource=contributions').then(r=>{if(live)D(r.data);}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[version]);
 const total=data?GROUPS.reduce((n,[k])=>n+data[k].length,0):0;
 async function remove(kind:string,item:Item,what:string){if(!window.confirm(`Delete this ${what}? This cannot be undone.`))return;B(item.id);E('');N('');try{await post('/api/manage',{action:'contribution.delete',kind,id:item.id});N(`Your ${what} was deleted.`);V(v=>v+1);}catch(e){E((e as Error).message);}finally{B('');}}
 return <Section title="My reviews and contributions" sub="Reviews, salaries, interview experiences, questions and answers you have shared. They are shown without your name." actions={<Link className="ep-btn secondary md" href="/companies">Find a company to review</Link>}>
  <Notice error={error} message={note}/>
  {!data?(!error&&<p role="status" className="ep-muted">Loading…</p>):!total?<Card><Empty title="You haven’t shared anything yet" action={<Link className="ep-btn primary md" href="/companies">Find your employer</Link>}>Review somewhere you have worked or applied, or add your salary. It helps other job seekers and stays anonymous.</Empty></Card>
  :GROUPS.filter(([k])=>data[k].length).map(([k,kind,heading,what])=><Card key={k} title={`${heading} (${data[k].length})`}><ul className="ep-list">{data[k].map(i=><li key={i.id} style={{alignItems:'flex-start'}}>
    <div className="ep-grow"><strong style={{whiteSpace:'normal'}}>{kind==='salary'?`${i.title}: $${Number(i.pay).toLocaleString('en-AU')} per ${i.period}`:i.title}</strong>
     <small style={{whiteSpace:'normal'}}>{i.company?<Link href={`/companies/${i.companyId}`}>{i.company}</Link>:'No employer named'}{kind==='review'&&i.rating?` · ${i.rating} of 5 · ${i.kind==='workplace'?'working there':'hiring experience'}`:''}{i.location?` · ${i.location}`:''} · {when(i.createdAt)}</small>
     {i.status==='rejected'&&i.reason&&<small style={{whiteSpace:'normal'}}>Reason: {i.reason}</small>}</div>
    {i.status&&STATUS[i.status]&&<Pill tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Pill>}
    {i.companyId&&kind!=='salary'&&<Link className="ep-btn ghost sm" href={`/companies/${i.companyId}?tab=${kind==='review'?'reviews':kind==='interview'?'interviews':'questions'}`}>View</Link>}
    <Button size="sm" tone="danger" disabled={!!busy} onClick={()=>remove(kind,i,what)}>{busy===i.id?'Deleting…':'Delete'}</Button></li>)}</ul></Card>)}
  {data&&total>0&&<p className="ep-muted" style={{fontSize:13}}>To change a review, open the company’s page and submit it again; the new one replaces the old.</p>}
 </Section>;
}
