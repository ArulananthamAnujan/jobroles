import type {MetadataRoute} from 'next';
import {indexingEnabled,siteOrigin} from '@/lib/job-posting';
// Crawling stays closed until SITE_INDEXING=true is set for the launch domain.
export default function robots():MetadataRoute.Robots{
 if(!indexingEnabled())return {rules:{userAgent:'*',disallow:'/'}};
 return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/account','/job-seeker','/employer','/admin','/auth/','/preview','/alerts/','/interview/']},sitemap:`${siteOrigin()}/sitemap.xml`};
}
