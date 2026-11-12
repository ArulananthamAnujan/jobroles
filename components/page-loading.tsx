import {SiteHeader} from './site-chrome';
import './job-page.css';
// Shown the moment a link is clicked, while the next page is fetched, so the site never looks frozen.
export default function PageLoading(){return <div className="jp-page"><SiteHeader/><main id="main" className="co-page pl" aria-busy="true"><p className="sr-only" role="status">Loading…</p><span className="pl-bar w40"/><span className="pl-bar w70"/><span className="pl-block"/><span className="pl-bar w90"/><span className="pl-bar w60"/><span className="pl-block"/></main></div>;}
