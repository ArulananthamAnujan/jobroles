import type {MetadataRoute} from 'next';
import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
import {siteOrigin} from '@/lib/job-posting';
import {ARTICLES} from '@/lib/career-advice';
export const revalidate=3600;
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const origin=siteOrigin();
 const pages:MetadataRoute.Sitemap=[{url:`${origin}/`,changeFrequency:'hourly',priority:1},{url:`${origin}/search`,changeFrequency:'hourly',priority:.9},{url:`${origin}/companies`,changeFrequency:'daily',priority:.7},{url:`${origin}/salaries`,changeFrequency:'daily',priority:.7},{url:`${origin}/events`,changeFrequency:'daily',priority:.6},{url:`${origin}/assessments`,changeFrequency:'monthly',priority:.5},{url:`${origin}/resume`,changeFrequency:'monthly',priority:.5},{url:`${origin}/career-advice`,changeFrequency:'weekly',priority:.6},...ARTICLES.map(a=>({url:`${origin}/career-advice/${a.slug}`,changeFrequency:'monthly' as const,priority:.5})),{url:`${origin}/market-guide`,changeFrequency:'weekly',priority:.6},{url:`${origin}/privacy`,changeFrequency:'yearly',priority:.2},{url:`${origin}/terms`,changeFrequency:'yearly',priority:.2}];
 if(!backendConfigured())return pages;
 const jobs:MetadataRoute.Sitemap=[],companies=new Set<string>();
 // A sitemap holds at most 50,000 URLs; page through live roles until that cap.
 for(let from=0;from<45000;from+=1000){
  const {data,error}=await publicJobsClient().from('jobs').select('id,company_id,published_at').eq('state','live').gt('expires_at',new Date().toISOString()).order('published_at',{ascending:false}).range(from,from+999);
  if(error||!data?.length)break;
  for(const j of data){jobs.push({url:`${origin}/jobs/${j.id}`,lastModified:j.published_at,changeFrequency:'daily',priority:.8});companies.add(j.company_id);}
  if(data.length<1000)break;
 }
 return [...pages,...jobs,...[...companies].map(id=>({url:`${origin}/companies/${id}`,changeFrequency:'daily' as const,priority:.5}))];
}
