import {Suspense} from 'react';
import {redirect} from 'next/navigation';
import LiveMarketplace from '@/components/live-marketplace';
import Marketplace from '@/components/marketplace';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){
 const {path=[]}=await params;
 if(path[0]==='preview')return <Suspense fallback={<p>Loading design preview…</p>}><Marketplace/></Suspense>;
 if(path.length&&path[0]!=='search'&&path[0]!=='jobs')redirect('/account');
 return <Suspense fallback={<p>Loading JobRoles…</p>}><LiveMarketplace/></Suspense>;
}
