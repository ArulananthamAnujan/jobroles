'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {pendingInvite,forgetInvite} from '@/lib/invite-token';
// A reminder shown on every page to someone who opened a team invitation, then went off to confirm their email or
// sign in another way: it brings them back to accept. It only appears once they are signed in with a confirmed email.
export default function PendingInvite(){
 const path=usePathname(),[show,S]=useState(false);
 useEffect(()=>{let live=true;
  if(path==='/account/invite'||!pendingInvite()){Promise.resolve().then(()=>{if(live)S(false);});return()=>{live=false;};}
  fetch('/api/account',{cache:'no-store'}).then(r=>r.json()).then((a:{user?:{confirmed?:boolean}|null})=>{if(live)S(Boolean(a.user?.confirmed));}).catch(()=>{});
  return()=>{live=false;};},[path]);
 if(!show)return null;
 return <div className="invite-reminder" role="status"><span><strong>You have a team invitation waiting.</strong> Accept it to join the company’s hiring team.</span>
  <span className="invite-reminder-actions"><Link className="jp-btn" href="/account/invite">Review and accept</Link><button type="button" className="text-link" onClick={()=>{forgetInvite();S(false);}}>Dismiss</button></span></div>;
}
