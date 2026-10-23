import {Suspense} from 'react';
import AdminConsole from '@/components/admin/console';
export const dynamic='force-dynamic';
export const metadata={title:'Admin · JobRoles',robots:{index:false}};
export default function Page(){return <Suspense fallback={<p>Loading…</p>}><AdminConsole/></Suspense>;}
