'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {employerGet,money,when} from './api';
import {Empty,Notice,Pill,Stat} from './ui';
import {Section,type PortalContext} from './portal';
type Order={id:string;job_id:string;amount_total:number;currency:string;starts_at:string;ends_at:string;created_at:string;invoice_url:string|null;jobs:{title:string}|null};
export default function Billing({ctx}:{ctx:PortalContext}){
 const params=useSearchParams();
 const [orders,O]=useState<Order[]|null>(null),[now,NW]=useState(0),[error,E]=useState('');
 useEffect(()=>{const c=new AbortController();employerGet<{orders:Order[]}>('billing',{company:ctx.company.id},c.signal).then(d=>{NW(Date.now());O(d.orders);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id]);
 const active=(orders||[]).filter(o=>new Date(o.starts_at).getTime()<=now&&new Date(o.ends_at).getTime()>now);
 const spent=(orders||[]).reduce((n,o)=>n+o.amount_total,0)/100;
 return <Section title="Billing" sub="Sponsored listings and tax invoices. Prices include GST." actions={<Link className="ep-btn primary md" href="/employer?view=performance">Sponsor a job</Link>}>
  <Notice error={error} message={params.get('sponsored')?'Payment received. Your sponsorship starts as soon as Stripe confirms it, usually within a minute.':undefined}/>
  {!orders?<p role="status">Loading billing…</p>:<>
   <div className="ep-stats"><Stat label="Active sponsorships" value={active.length}/><Stat label="Orders" value={orders.length}/><Stat label="Total spent (incl. GST)" value={money(spent)}/></div>
   {orders.length?<div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Order date</th><th>Job</th><th>Sponsored</th><th className="num">Amount</th><th>Invoice</th></tr></thead><tbody>{orders.map(o=>{const on=new Date(o.starts_at).getTime()<=now&&new Date(o.ends_at).getTime()>now;return <tr key={o.id}><td>{when(o.created_at)}</td><td><Link href={`/jobs/${o.job_id}`} className="ep-row-title">{o.jobs?.title||'Job'}</Link></td><td>{when(o.starts_at)} – {when(o.ends_at)} {on&&<Pill tone="teal">Active</Pill>}</td><td className="num">{money(o.amount_total/100)} {o.currency.toUpperCase()}</td><td>{o.invoice_url?<a className="ep-btn ghost sm" href={o.invoice_url} target="_blank" rel="noopener noreferrer">Tax invoice</a>:<span className="ep-muted">Emailed by Stripe</span>}</td></tr>;})}</tbody></table></div>
   :<div className="ep-card"><Empty title="No orders yet" action={<Link className="ep-btn primary md" href="/employer?view=performance">Sponsor a job</Link>}>Sponsoring lifts a live job in best-match search and labels it Sponsored. You receive a tax invoice with your ABN.</Empty></div>}
  </>}
 </Section>;
}
