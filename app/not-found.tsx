import Link from 'next/link';
import {Brand} from '@/components/market-ui';
export default function NotFound(){return <><header className="topbar"><Brand/></header><main className="main account-shell"><h1>This page isn’t available</h1><p>The job may have closed or been filled, or the link may be wrong.</p><p><Link className="text-link" href="/search">Search current jobs</Link></p></main></>;}
