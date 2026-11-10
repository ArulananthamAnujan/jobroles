import {Suspense} from 'react';
import {notFound,redirect} from 'next/navigation';
import JobSearch from '@/components/job-search';
import Marketplace from '@/components/marketplace';
const LEGACY_ACCOUNT=new Set(['login','signin','sign-in','signup','sign-up','register','dashboard','profile','applications','saved','hiring']);
export default async function Page({params}:{params:Promise<{path?:string[]}>}){
 const {path=[]}=await params;
 if(path[0]==='preview')return <Suspense fallback={<p>Loading design preview…</p>}><Marketplace/></Suspense>;
 // Old single-word addresses still land somewhere useful; anything else is a real 404 so search engines do not index typos as sign-in pages.
 if(path.length&&path[0]!=='search'){
  if(path.length===1&&path[0]==='jobs')redirect('/search');
  if(path.length===1&&LEGACY_ACCOUNT.has(path[0]))redirect('/account');
  notFound();
 }
 return <Suspense fallback={<p>Loading JobRoles…</p>}><JobSearch/></Suspense>;
}
