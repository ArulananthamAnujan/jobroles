import {Suspense} from 'react';
import AccountWorkspace from '@/components/account-workspace';
export const dynamic='force-dynamic';
export default function Page(){return <Suspense fallback={<p>Loading portal…</p>}><AccountWorkspace portal="seeker"/></Suspense>;}
