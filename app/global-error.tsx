'use client';
import {useEffect} from 'react';
import {reportClientError} from '@/components/report-client-error';
// Replaces the root layout when it fails, so it carries its own document and minimal styles.
export default function GlobalError({error,retry}:{error:Error&{digest?:string};retry:()=>void}){
 useEffect(()=>{reportClientError(error);},[error]);
 return <html lang="en-AU"><body style={{fontFamily:'system-ui,sans-serif',margin:0,padding:'48px 24px',color:'#1f2b33'}}><title>Something went wrong · JobRoles</title><h1>Something went wrong</h1><p>We’ve been told about it. Please try again.</p><button onClick={()=>retry()} style={{padding:'12px 20px',background:'#076d65',color:'#fff',border:0,borderRadius:8,fontWeight:700}}>Try again</button></body></html>;
}
