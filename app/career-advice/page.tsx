import type {Metadata} from 'next';
import Link from 'next/link';
import {ARTICLES} from '@/lib/career-advice';
import {siteOrigin} from '@/lib/job-posting';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
import '@/components/career.css';
export const metadata:Metadata={title:'Career advice: resumes, interviews and pay in Australia | JobRoles',description:'Practical guides to writing a resume, answering interview questions, negotiating pay and understanding your rights at work in Australia.',alternates:{canonical:`${siteOrigin()}/career-advice`}};
const TOOLS=[['/resume','Resume builder','Build a resume and apply with it.'],['/assessments','Skills assessments','Show employers what you can do.'],['/salaries','Salaries','See what a job pays.'],['/events','Hiring events','Meet employers and interview on the day.']];
export default function CareerAdvice(){
 const categories=[...new Set(ARTICLES.map(a=>a.category))];
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page">
  <section className="cd-hero"><div><h1>Career advice</h1><p className="muted">Practical guides for every step, from your resume to your first pay slip.</p></div></section>
  <div className="co-wrap" style={{marginTop:24}}>
   <section className="ca-grid">{TOOLS.map(([href,title,text])=><Link key={href} href={href} className="cr-card"><h2 style={{fontSize:18}}>{title}</h2><p className="muted">{text}</p></Link>)}</section>
   {categories.map(c=><section key={c} className="co-card"><h2>{c}</h2><div className="ca-grid">{ARTICLES.filter(a=>a.category===c).map(a=><article key={a.slug}><h3><Link className="text-link" href={`/career-advice/${a.slug}`}>{a.title}</Link></h3><p className="muted small">{a.summary} · {a.minutes} min read</p></article>)}</div></section>)}
  </div>
 </main><SiteFooter/></div>;
}
