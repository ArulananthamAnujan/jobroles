import type {Metadata} from 'next';
import './globals.css';
import {indexingEnabled,siteOrigin} from '@/lib/job-posting';
export const metadata:Metadata={metadataBase:new URL(siteOrigin()),title:'JobRoles · Australian jobs with the pay shown',description:'An Australian job board. Every listing shows its pay range and comes from a verified employer, and your resume is shared only when you apply.',referrer:'no-referrer',robots:indexingEnabled()?{index:true,follow:true}:{index:false,follow:false},icons:{icon:'/assets/brand.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>}
