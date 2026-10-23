import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import {AssessmentRunner} from '@/components/assessments';
import '@/components/job-page.css';
export const dynamic='force-dynamic';
async function load(code:string){if(!/^[a-z-]{3,40}$/.test(code)||!backendConfigured())return null;const {data}=await publicJobsClient().from('assessments').select('code,title,description,minutes').eq('code',code).maybeSingle();return data;}
export async function generateMetadata({params}:{params:Promise<{code:string}>}):Promise<Metadata>{const a=await load((await params).code);return {title:a?`${a.title} assessment | JobRoles`:'Assessment | JobRoles',description:a?.description};}
export default async function Assessment({params}:{params:Promise<{code:string}>}){
 const a=await load((await params).code);if(!a)notFound();
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page">
  <section className="cd-hero"><div><p><Link className="text-link" href="/assessments">All assessments</Link></p><h1>{a.title}</h1><p className="muted">{a.description}</p></div></section>
  <div className="co-wrap" style={{marginTop:24,maxWidth:760}}><AssessmentRunner item={a}/></div>
 </main><SiteFooter/></div>;
}
