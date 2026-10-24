import type {Metadata} from 'next';
import Link from 'next/link';
import {siteOrigin} from '@/lib/job-posting';
import {SiteHeader,SiteFooter} from '@/components/site-chrome';
import ContactForm from '@/components/contact-form';
import '@/components/job-page.css';
import '@/components/career.css';
export const metadata:Metadata={title:'Help centre | JobRoles',description:'Answers about job searching, applications, employer accounts, sponsored jobs, reviews and privacy on JobRoles, and how to contact us.',alternates:{canonical:`${siteOrigin()}/help`}};
const FAQ:[string,[string,string][]][]=[
 ['Job seekers',[
  ['How do I apply for a job?','Open the job and choose Apply now. Sign in or create a free account, choose your resume, answer any screening questions and submit. You can track every application under My applications.'],
  ['Can I see whether an employer read my application?','Yes. Your application page shows each stage, such as Reviewed, Shortlisted or Interviewing, and any messages or interview times from the employer.'],
  ['How do job alerts work?','On any search, choose Save search and get alerts. We email you new matching jobs once a day. Manage or switch off alerts under Saved jobs and searches.'],
  ['How do I withdraw an application?','Open the application and choose Withdraw application. The employer is told, and you can ask to be reinstated later.'],
  ['How do video interviews work?','If an employer books a JobRoles video interview, a Join button appears on your application 30 minutes before the start. It works in your browser with no download.'],
 ]],
 ['Employers',[
  ['How do I post a job?','Register your company in the employer portal. We check your ABN, usually within one business day. Then post jobs from Jobs, Post a job. Every listing must show a genuine pay range.'],
  ['How much does it cost?','Posting jobs is free. You can pay to sponsor jobs: either a fixed 30-day sponsorship or pay-per-click with a daily budget you control. Invalid clicks are filtered out and never charged.'],
  ['How do I add my team?','In the employer portal, go to Team and create an invitation link for a recruiter or hiring manager. You choose which jobs each person can see.'],
  ['Can I respond to reviews?','Yes. Company owners can post one public reply to each review from Reviews in the employer portal. You cannot remove genuine reviews, but you can report ones that break our guidelines.'],
 ]],
 ['Reviews, salaries and community',[
  ['Who can write reviews?','Anyone with a confirmed account who is not on the employer’s team can review working there. Hiring-experience reviews are only open to people who applied through JobRoles.'],
  ['Are reviews anonymous?','Yes. We never show your name or email to the public or the employer.'],
  ['Why was my post not published?','Posts are checked against our guidelines. We do not publish contact details, names of individuals, offensive language or unproven allegations against people.'],
  ['How are salaries shown?','Salaries people share appear only once at least three people report the same job, so no single person can be identified.'],
 ]],
 ['Account, privacy and safety',[
  ['How do I download or delete my data?','Go to Privacy and data in your account. You can download everything we hold about you or ask us to delete your account.'],
  ['How do I spot a job scam?','Real employers never ask you to pay to apply, buy equipment up front, or move a conversation to a personal messaging app. Use Report this job on any listing, or contact us below.'],
  ['I forgot my password','Choose Forgot password on the sign-in page and we will email you a reset link.'],
 ]],
];
export default function Help(){
 const ld={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.flatMap(([,qs])=>qs.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}})))};
 return <div className="jp-page"><SiteHeader/><main id="main" className="co-page">
  <section className="cd-hero"><div><h1>How can we help?</h1><p className="muted">Answers to common questions, and a way to reach our team.</p><nav className="co-subtabs" aria-label="Help topics">{FAQ.map(([t])=><a key={t} href={`#${t.replace(/\W+/g,'-').toLowerCase()}`}>{t}</a>)}<a href="#contact">Contact us</a></nav></div></section>
  <div className="co-wrap" style={{marginTop:24,maxWidth:900}}>
   {FAQ.map(([title,qs])=><section key={title} className="co-card" id={title.replace(/\W+/g,'-').toLowerCase()}><h2>{title}</h2>{qs.map(([q,a])=><details key={q} className="hp-q"><summary>{q}</summary><p>{a}</p></details>)}</section>)}
   <p className="muted">Looking for tips on resumes and interviews? See <Link className="text-link" href="/career-advice">career advice</Link>.</p>
   <ContactForm/>
  </div>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(ld).replace(/</g,'\\u003c')}}/>
 </main><SiteFooter/></div>;
}
