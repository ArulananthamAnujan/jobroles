import {Suspense} from 'react';
import type {Metadata} from 'next';
import {siteOrigin} from '@/lib/job-posting';
import {notFound,redirect} from 'next/navigation';
import JobSearch from '@/components/job-search';
import Marketplace from '@/components/marketplace';
const LEGACY_ACCOUNT=new Set(['login','signin','sign-in','signup','sign-up','register','dashboard','profile','applications','saved','hiring']);
const one=(v:string|string[]|undefined)=>(typeof v==='string'?v:'').trim().slice(0,80);
// The home page and the search page each get their own title, description and canonical address. A search for
// "chef" in "Melbourne" is titled that way, so it can be found and shared; filters and page numbers are left out of
// the canonical address so the same results are not indexed many times over.
export async function generateMetadata({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{
 const [{path=[]},query]=await Promise.all([params,searchParams]),origin=siteOrigin();
 if(!path.length)return {alternates:{canonical:`${origin}/`}};
 if(path[0]!=='search'||path.length>1)return {};
 const q=one(query.q),near=one(query.near)||one(query.location),keep=new URLSearchParams();if(q)keep.set('q',q);if(near)keep.set('near',near);
 const what=q?`${q[0].toUpperCase()}${q.slice(1)} jobs`:'Jobs',where=near?` in ${near}`:q?' in Australia':'';
 return {title:q||near?`${what}${where} | JobRoles`:'Search jobs in Australia | JobRoles',
  description:q||near?`${what}${where} on JobRoles. Listings from verified employers show their pay range up front; apply with one resume.`:'Search Australian jobs by title, keyword, company or suburb. Filter by pay, job type, work setting and date posted.',
  alternates:{canonical:`${origin}/search${keep.size?`?${keep}`:''}`}};
}
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
