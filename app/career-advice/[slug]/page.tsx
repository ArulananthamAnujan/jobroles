import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ARTICLES,articleBySlug} from '@/lib/career-advice';
import {siteOrigin} from '@/lib/job-posting';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
import '@/components/career.css';
export function generateStaticParams(){return ARTICLES.map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const a=articleBySlug((await params).slug);if(!a)return {title:'Article not found · JobRoles'};return {title:`${a.title} | JobRoles career advice`,description:a.summary,alternates:{canonical:`${siteOrigin()}/career-advice/${a.slug}`}};}
export default async function ArticlePage({params}:{params:Promise<{slug:string}>}){
 const a=articleBySlug((await params).slug);if(!a)notFound();
 const blocks:React.ReactNode[]=[];let list:string[]=[];
 const flush=()=>{if(list.length){blocks.push(<ul key={`l${blocks.length}`}>{list.map(x=><li key={x}>{x}</li>)}</ul>);list=[];}};
 for(const b of a.body){if(b.startsWith('- ')){list.push(b.slice(2));continue;}flush();blocks.push(b.startsWith('## ')?<h2 key={blocks.length}>{b.slice(3)}</h2>:<p key={blocks.length}>{b}</p>);}flush();
 const related=ARTICLES.filter(x=>x.category===a.category&&x.slug!==a.slug).slice(0,3);
 const ld={'@context':'https://schema.org','@type':'Article',headline:a.title,description:a.summary,publisher:{'@type':'Organization',name:'JobRoles'},mainEntityOfPage:`${siteOrigin()}/career-advice/${a.slug}`};
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page"><article className="ca-article">
  <p><Link className="text-link" href="/career-advice">Career advice</Link> · {a.category}</p><h1>{a.title}</h1><p className="muted">{a.minutes} min read</p>
  {blocks}
  <div className="cr-card"><h2 style={{marginTop:0}}>Ready for the next step?</h2><div className="row"><Link className="jp-btn" href="/search">Find jobs</Link><Link className="jp-btn secondary" href="/resume">Build your resume</Link></div></div>
  {related.length>0&&<section><h2>Related</h2><ul>{related.map(r=><li key={r.slug}><Link className="text-link" href={`/career-advice/${r.slug}`}>{r.title}</Link></li>)}</ul></section>}
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(ld).replace(/</g,'\\u003c')}}/>
 </article></main><SiteFooter/></div>;
}
