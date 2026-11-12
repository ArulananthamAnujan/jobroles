import Link from 'next/link';
import type {Metadata} from 'next';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
export const metadata:Metadata={title:'Page not found | JobRoles',robots:{index:false}};
// Shown for any address that does not exist, with the normal site header so there is always a way back.
export default function NotFound(){return <div className="jp-page"><SiteHeader/><main id="main" className="co-page"><div className="nf"><p className="nf-code">404</p><h1>We can’t find that page</h1><p className="muted">The link may be mistyped or out of date. If you were looking for a job, it may have closed or been filled.</p>
 <div className="nf-actions"><Link className="jp-btn" href="/search">Search jobs</Link><Link className="jp-btn secondary" href="/">Go to the home page</Link><Link className="jp-btn secondary" href="/help">Help centre</Link></div></div></main><SiteFooter/></div>;}
