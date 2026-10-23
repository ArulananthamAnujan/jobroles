import type {Metadata} from 'next';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import ResumeBuilder from '@/components/resume-builder';
import '@/components/job-page.css';
export const metadata:Metadata={title:'Free resume builder | JobRoles',description:'Build a clean, Australian-style resume from your experience, download it as a PDF, and apply with it on JobRoles.',robots:{index:true}};
export default function ResumePage(){return <div className="jp-page"><SiteHeader/><main id="main" className="co-page"><ResumeBuilder/></main><SiteFooter/></div>;}
