'use client';
import Link from 'next/link';
import ChangePassword from '../change-password';
import {Card} from '../employer/ui';
import {Section} from '../employer/shell';
// Sign-in details for the job seeker: the email they use, their password, and where to delete the account.
export default function AccountSettings({email}:{email:string}){
 return <Section title="Account and password" sub="How you sign in to JobRoles.">
  <Card title="Sign-in details"><ul className="ep-list">
   <li><div className="ep-grow"><strong>Email address</strong><small>{email}</small></div></li>
   <li style={{alignItems:'flex-start'}}><div className="ep-grow"><strong>Password</strong><small style={{whiteSpace:'normal'}}>Choose a new password. If you signed up with Google you may not have one yet; setting one lets you sign in either way.</small></div><ChangePassword returnTo="/job-seeker"/></li>
   <li><div className="ep-grow"><strong>Your name and profile</strong><small>The name employers see on your applications.</small></div><Link className="ep-btn secondary sm" href="/job-seeker?view=profile">Edit profile</Link></li>
  </ul></Card>
  <Card title="Your data"><ul className="ep-list">
   <li><div className="ep-grow"><strong>Download a copy of your data</strong><small>Your profile, applications and messages as a file.</small></div><a className="ep-btn secondary sm" href="/api/export">Download</a></li>
   <li><div className="ep-grow"><strong>Delete your account</strong><small style={{whiteSpace:'normal'}}>Ask us to erase your account, resumes and applications.</small></div><Link className="ep-btn danger sm" href="/job-seeker?view=privacy">Request deletion</Link></li>
  </ul></Card>
 </Section>;
}
