import type {Metadata} from 'next';
import Link from 'next/link';
import {siteOrigin} from '@/lib/job-posting';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
import '@/components/career.css';
export const metadata:Metadata={title:'Employer pricing | JobRoles',description:'Posting jobs on JobRoles is free. Pay only if you choose to sponsor a job, with a daily budget you control.',alternates:{canonical:`${siteOrigin()}/pricing`}};
const FREE=['Post jobs at no cost. Each listing is live for 30 days and can be extended','Applicant tracking: stages, notes, messages and interview scheduling','Your company page, with reviews and your response record','Import jobs from a spreadsheet or your careers-site feed','Invite recruiters and hiring managers to your team','Candidate search, once your company is verified'];
const FAQ:[string,string][]=[
 ['Is posting a job really free?','Yes. There is no charge to post a job, receive applications or contact applicants. Every listing must show its pay, and each one is checked before it goes live.'],
 ['When would I pay?','Only if you choose to sponsor a job so it appears higher in search results. Sponsoring is optional and you can stop at any time.'],
 ['How does pay per click work?','You buy credit in advance, then set a daily budget and the most you will pay for a click on each sponsored job. You are charged only when a job seeker opens the job from search results. Repeat and invalid clicks are filtered out and never charged.'],
 ['Is there a fixed-price option?','Yes. You can sponsor a single job for a fixed 30 days from the Performance page in your employer portal. The price is shown before you pay.'],
 ['Is GST included?','Prices are shown before GST. GST is added at checkout and you are emailed a tax invoice showing your ABN.'],
 ['Does credit expire?','No. Credit stays on your account for as long as the account is open.'],
];
export default function Pricing(){
 const ld={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))};
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page">
  <section className="cd-hero"><div><h1>Posting jobs is free</h1><p className="muted">Post jobs, receive applications and manage hiring at no cost. Pay only if you choose to sponsor a job for more visibility.</p>
   <div className="row" style={{marginTop:16}}><Link className="jp-btn" href="/employer">Post a job for free</Link><Link className="jp-btn secondary" href="/help#employers">Employer help</Link></div></div></section>
  <div className="co-wrap pr-grid" style={{marginTop:24}}>
   <section className="co-card"><p className="pr-kicker">Standard</p><h2>Free</h2><p className="muted">Everything you need to hire.</p><ul className="pr-list">{FREE.map(f=><li key={f}>{f}</li>)}</ul></section>
   <section className="co-card"><p className="pr-kicker">Sponsored, pay per click</p><h2>From $0.50 a click</h2><p className="muted">Appear higher in search. You set the limits.</p>
    <ul className="pr-list"><li>Cost per click you choose: $0.50 to $20</li><li>Daily budget you choose: $5 to $1,000 a job</li><li>Prepaid credit from $50, in packs of $50, $100, $250, $500 or $1,000</li><li>Pause or change a campaign at any time</li><li>Invalid and repeat clicks are never charged</li></ul></section>
   <section className="co-card"><p className="pr-kicker">Sponsored, fixed price</p><h2>30 days, one price</h2><p className="muted">A simple boost for a single job.</p>
    <ul className="pr-list"><li>One job sponsored for 30 days</li><li>One payment, no budget to manage</li><li>Price shown in your employer portal before you pay</li></ul></section>
  </div>
  <div className="co-wrap" style={{marginTop:24,maxWidth:900}}><section className="co-card"><h2>Common questions</h2>{FAQ.map(([q,a])=><details key={q} className="pr-faq"><summary>{q}</summary><p>{a}</p></details>)}<p className="muted small">Prices are in Australian dollars and exclude GST.</p></section></div>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(ld).replace(/</g,'\\u003c')}}/>
 </main><SiteFooter/></div>;
}
