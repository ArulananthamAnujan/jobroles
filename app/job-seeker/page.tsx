import {Suspense} from 'react';
import SeekerPortal from '@/components/seeker/portal';
export const dynamic='force-dynamic';
export const metadata={title:'Your account · JobRoles',robots:{index:false,follow:false}};
export default function Page(){return <Suspense fallback={<p>Loading portal…</p>}><SeekerPortal/></Suspense>;}
