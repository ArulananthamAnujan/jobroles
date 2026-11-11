import type {Metadata} from 'next';
import './globals.css';
import Pwa from '@/components/pwa';
import {indexingEnabled,siteOrigin} from '@/lib/job-posting';
export const metadata:Metadata={metadataBase:new URL(siteOrigin()),title:'JobRoles · Australian jobs with pay up front',description:'An Australian job board. Jobs posted here show their pay range and come from verified employers, alongside roles from employers’ own careers sites. Your resume is shared only when you apply.',referrer:'same-origin',robots:indexingEnabled()?{index:true,follow:true}:{index:false,follow:false},icons:{icon:'/assets/brand.svg',apple:'/assets/icon-180.png'},appleWebApp:{capable:true,title:'JobRoles',statusBarStyle:'black-translucent'}};
export const viewport={themeColor:'#172b3a'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}<Pwa/></body></html>}
