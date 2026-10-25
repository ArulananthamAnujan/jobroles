import {Suspense} from 'react';
import SeekerPortal from '@/components/seeker/portal';
export const dynamic='force-dynamic';
export default function Page(){return <Suspense fallback={<p>Loading portal…</p>}><SeekerPortal/></Suspense>;}
