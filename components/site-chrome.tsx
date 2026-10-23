import Link from 'next/link';
import {Brand} from './market-ui';
import './site-chrome.css';
export function SiteHeader(){return <header className="jr-header"><Brand/><nav aria-label="Main" className="jr-nav"><Link href="/search">Find jobs</Link><Link href="/companies">Company reviews</Link><Link href="/market-guide">Salary guide</Link></nav><div className="jr-header-end"><Link href="/job-seeker">Sign in</Link><span aria-hidden="true" className="jr-divider"/><Link href="/employer" className="jr-employers">Employers / Post job</Link></div></header>;}
export function SiteFooter(){return <footer className="jr-footer"><Brand/><nav aria-label="Footer"><Link href="/search">Find jobs</Link><Link href="/companies">Companies</Link><Link href="/market-guide">Salary guide</Link><Link href="/employer">Post a job</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><p>© {new Date().getFullYear()} JobRoles · Australian jobs with the pay shown</p></footer>;}
