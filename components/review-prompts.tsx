'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
type Prompt={companyId:string;company:string;jobTitle:string;stage:string};
// Asks seekers to review employers they applied to, and to share their pay, which builds the data other people rely on.
export default function ReviewPrompts(){
 const [items,I]=useState<Prompt[]>([]);
 useEffect(()=>{let live=true;fetch('/api/career',{cache:'no-store'}).then(r=>r.ok?r.json():null).then((d:{prompts?:Prompt[]}|null)=>{if(live&&d?.prompts)I(d.prompts);}).catch(()=>{});return()=>{live=false;};},[]);
 return <section className="rp" aria-labelledby="rp-title"><h2 id="rp-title">Help other job seekers</h2>
  <div className="rp-grid">{items.slice(0,3).map(p=><div key={p.companyId} className="rp-card"><strong>How was applying to {p.company}?</strong><p>Your review of the hiring process for {p.jobTitle} helps others know what to expect. It is anonymous.</p><Link className="jp-btn secondary" href={`/companies/${p.companyId}?tab=reviews&type=hiring&write=1`}>Review hiring</Link></div>)}
   <div className="rp-card"><strong>Share your salary</strong><p>Add what you earn, anonymously. Pay is only shown once three people share the same job.</p><Link className="jp-btn secondary" href="/salaries">Add your salary</Link></div>
   <div className="rp-card"><strong>Review where you work</strong><p>Tell others what it is really like to work at your current or last employer.</p><Link className="jp-btn secondary" href="/companies">Find your employer</Link></div></div></section>;
}
