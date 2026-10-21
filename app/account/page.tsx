import {Suspense} from 'react';
import AccountWorkspace from '@/components/account-workspace';
export const dynamic='force-dynamic';
export default function AccountPage(){return <Suspense fallback={<p>Loading account…</p>}><AccountWorkspace/></Suspense>;}
