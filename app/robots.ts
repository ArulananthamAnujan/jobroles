import type {MetadataRoute} from 'next';
import {indexingEnabled,siteOrigin} from '@/lib/job-posting';
// Open to search engines when the site runs at its real address (see indexingEnabled); private areas stay closed.
export default function robots():MetadataRoute.Robots{
 if(!indexingEnabled())return {rules:{userAgent:'*',disallow:'/'}};
 return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/account','/job-seeker','/employer','/admin','/auth/','/preview','/alerts/','/interview/']},sitemap:`${siteOrigin()}/sitemap.xml`};
}
