import Link from 'next/link';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import '@/components/job-page.css';
// A company page that is not public: either the address is wrong or the employer is still being verified.
export default function CompanyNotFound(){return <div className="jp-page"><SiteHeader/><main id="main" className="co-page"><div className="nf"><h1>This company page isn’t public yet</h1><p className="muted">Company pages appear once we have checked the employer’s ABN, which usually takes one business day. If the link was sent to you, it may also be mistyped.</p>
 <p className="muted"><strong>Is this your company?</strong> You don’t need to do anything. You can keep filling in your page and preparing jobs, and it will go public as soon as the check is done.</p>
 <div className="nf-actions"><Link className="jp-btn" href="/employer?view=company">Back to my company page</Link><Link className="jp-btn secondary" href="/companies">Browse companies</Link></div></div></main><SiteFooter/></div>;}
