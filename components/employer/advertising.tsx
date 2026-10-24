'use client';
import {useCallback,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {employerGet,employerPost,post,money,when} from './api';
import {Button,Card,Empty,Notice,Pill,Stat} from './ui';
import {Section,type PortalContext} from './portal';
type Campaign={dailyBudget:number;cpc:number;active:boolean};
type Row={jobId:string;title:string;campaign:Campaign|null;spentToday:number;clicks7:number;spent7:number;applications7:number;showing:boolean};
type Account={balance:number;invalid7?:number;jobs:Row[];ledger:{id:string;amount:number;kind:string;createdAt:string;invoiceUrl:string|null}[]};
const PACKS=[5000,10000,25000,50000,100000];
const dollars=(cents:number)=>money(cents/100);
// Pay-per-click sponsored jobs: prepaid credit, a daily budget and cost per click for each live job.
export default function Advertising({ctx}:{ctx:PortalContext}){
 const params=useSearchParams();
 const [a,A]=useState<Account|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(''),[edit,ED]=useState<Record<string,{budget:string;cpc:string}>>({});
 const load=useCallback(async(signal?:AbortSignal)=>{A(await employerGet<Account>('advertising',{company:ctx.company.id},signal));},[ctx.company.id]);
 useEffect(()=>{const c=new AbortController();Promise.resolve().then(()=>load(c.signal)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[load]);
 const canPay=ctx.role==='owner'||ctx.role==='recruiter';
 async function buy(amount:number){B(`buy-${amount}`);E('');try{const r=await post<{url:string}>('/api/billing/credit',{companyId:ctx.company.id,amount});window.location.assign(r.url);}catch(e){E((e as Error).message);B('');}}
 async function save(row:Row,active:boolean){const v=edit[row.jobId],budget=Math.round(Number(v?.budget??(row.campaign?.dailyBudget??2000)/100)*100),cpc=Math.round(Number(v?.cpc??(row.campaign?.cpc??150)/100)*100);
  B(row.jobId);E('');N('');try{await employerPost({action:'campaign',jobId:row.jobId,dailyBudget:budget,cpc,active});N(active?`${row.title} is now sponsored.`:`${row.title} is paused.`);await load();}catch(e){E((e as Error).message);}finally{B('');}}
 if(!canPay)return <Section title="Sponsored jobs"><Card><Empty title="Owners and recruiters only">Ask an owner to give you the recruiter role to manage sponsored jobs.</Empty></Card></Section>;
 const running=(a?.jobs||[]).filter(j=>j.campaign?.active);
 return <Section title="Sponsored jobs" sub="Pay only when someone clicks. Sponsored jobs appear higher in search and are labelled Sponsored. Each person is charged once per job per day.">
  <Notice error={error} message={note||(params.get('credit')?'Payment received. Credit is added as soon as Stripe confirms it, usually within a minute.':undefined)}/>
  {!a?<p role="status">Loading…</p>:<>
   <div className="ep-stats"><Stat label="Credit balance" value={dollars(a.balance)} hint="Before GST"/><Stat label="Running campaigns" value={running.length}/><Stat label="Clicks, 7 days" value={a.jobs.reduce((n,j)=>n+Number(j.clicks7),0)}/><Stat label="Spent, 7 days" value={dollars(a.jobs.reduce((n,j)=>n+Number(j.spent7),0))} hint={a.invalid7?`${a.invalid7} invalid clicks filtered, not charged`:'Invalid clicks are never charged'}/></div>
   <Card title="Add credit" action={!ctx.company.verified_at?<Pill tone="amber">Available once verified</Pill>:undefined}>
    <p className="ep-muted" style={{marginBottom:12}}>Credit never expires while your account is open. Stripe adds GST and emails a tax invoice with your ABN.</p>
    <div className="ep-actions">{PACKS.map(p=><Button key={p} tone="secondary" disabled={Boolean(busy)||!ctx.company.verified_at} onClick={()=>buy(p)}>{busy===`buy-${p}`?'Opening Stripe…':dollars(p)}</Button>)}</div>
   </Card>
   {a.jobs.length?<div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Job</th><th>Budget a day</th><th>Per click</th><th className="num">Spent today</th><th className="num">Clicks (7d)</th><th className="num">Applies (7d)</th><th>Status</th><th/></tr></thead><tbody>
    {a.jobs.map(r=>{const v=edit[r.jobId]||{budget:String((r.campaign?.dailyBudget??2000)/100),cpc:String((r.campaign?.cpc??150)/100)};const set=(k:'budget'|'cpc',x:string)=>ED({...edit,[r.jobId]:{...v,[k]:x}});
     return <tr key={r.jobId}><td><div className="ep-row-title">{r.title}</div></td>
      <td><label className="ep-money"><span>$</span><input type="number" min={5} max={1000} step={1} value={v.budget} onChange={e=>set('budget',e.target.value)} aria-label={`Daily budget for ${r.title}`}/></label></td>
      <td><label className="ep-money"><span>$</span><input type="number" min={0.5} max={20} step={0.05} value={v.cpc} onChange={e=>set('cpc',e.target.value)} aria-label={`Cost per click for ${r.title}`}/></label></td>
      <td className="num">{dollars(r.spentToday)}</td><td className="num">{r.clicks7}</td><td className="num">{r.applications7}</td>
      <td>{r.campaign?.active?(r.showing?<Pill tone="teal">Showing</Pill>:<Pill tone="amber">{a.balance<(r.campaign.cpc)?'Out of credit':'Daily budget reached'}</Pill>):<Pill>{r.campaign?'Paused':'Not sponsored'}</Pill>}</td>
      <td><div className="ep-row-actions">{r.campaign?.active?<><Button size="sm" tone="secondary" disabled={busy===r.jobId} onClick={()=>save(r,true)}>Update</Button><Button size="sm" tone="ghost" disabled={busy===r.jobId} onClick={()=>save(r,false)}>Pause</Button></>
       :<Button size="sm" disabled={busy===r.jobId||!ctx.company.verified_at} onClick={()=>save(r,true)}>Sponsor</Button>}</div></td></tr>;})}
   </tbody></table></div>:<Card><Empty title="No live jobs" action={<Button onClick={()=>ctx.go('jobs',{new:'1'})}>Post a job</Button>}>Sponsor a job once it is live.</Empty></Card>}
   {a.ledger.length>0&&<Card title="Credit history"><ul className="ep-list">{a.ledger.map(l=><li key={l.id}><div className="ep-grow">{l.kind==='topup'?'Credit purchase':l.kind==='refund'?'Refund':'Adjustment'}<small>{when(l.createdAt)}</small></div><strong>{l.amount>0?'+':''}{dollars(l.amount)}</strong>{l.invoiceUrl&&<a className="ep-btn ghost sm" href={l.invoiceUrl} target="_blank" rel="noopener noreferrer">Tax invoice</a>}</li>)}</ul></Card>}
  </>}
 </Section>;
}
