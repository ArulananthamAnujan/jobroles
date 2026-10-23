'use client';
import {useEffect} from 'react';
import Link from 'next/link';
import {reportClientError} from '@/components/report-client-error';
export default function Error({error,retry}:{error:Error&{digest?:string};retry:()=>void}){
 useEffect(()=>{reportClientError(error);},[error]);
 return <main className="main account-shell"><h1>Something went wrong</h1><p>We’ve been told about it. Your applications and saved jobs are safe.</p><p><button className="jp-btn" onClick={()=>retry()}>Try again</button></p><p><Link className="text-link" href="/search">Go to job search</Link></p></main>;
}
