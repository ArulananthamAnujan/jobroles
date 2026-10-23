import type {Metadata} from 'next';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import {AssessmentList} from '@/components/assessments';
import '@/components/job-page.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Skills assessments: show employers what you can do | JobRoles',description:'Free short skills tests in customer service, numeracy, written English, attention to detail, workplace safety and spreadsheets. Share your results with employers.'};
export default async function Assessments(){
 const {data}=backendConfigured()?await publicJobsClient().from('assessments').select('code,title,description,minutes').order('sort'):{data:[]};
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page">
  <section className="cd-hero"><div><h1>Skills assessments</h1><p className="muted">Short, free tests that show employers your skills. Your level appears on applications you send, and you choose which results to share.</p></div></section>
  <div className="co-wrap" style={{marginTop:24}}><AssessmentList items={data||[]}/></div>
 </main><SiteFooter/></div>;
}
