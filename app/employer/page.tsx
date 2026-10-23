import {Suspense} from 'react';
import EmployerPortal from '@/components/employer/portal';
export const dynamic='force-dynamic';
export const metadata={title:'Employer portal · JobRoles'};
export default function Page(){return <Suspense fallback={<p>Loading portal…</p>}><EmployerPortal/></Suspense>;}
