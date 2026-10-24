'use client';
import {useState} from 'react';
import {Card,Button} from './ui';
// Links an employer can share with staff (workplace reviews) and past applicants (hiring reviews).
export default function ReviewInvite({companyId}:{companyId:string}){
 const [copied,C]=useState('');
 const origin=typeof window==='undefined'?'':window.location.origin;
 const links:[string,string,string][]=[['staff','Ask your employees','Share in your staff newsletter or intranet. Reviews stay anonymous.'],['applicants','Ask past applicants','Only people who applied through JobRoles can review your hiring.']];
 const url=(k:string)=>`${origin}/companies/${companyId}?tab=reviews&type=${k==='staff'?'workplace':'hiring'}&write=1`;
 return <Card title="Get more reviews"><p className="ep-muted" style={{marginBottom:12}}>Companies with recent reviews get more applications. You can invite reviews but must not pressure, reward or edit them.</p>
  <div className="ep-grid">{links.map(([k,t,d])=><div key={k} className="ep-section"><h3>{t}</h3><p className="ep-muted">{d}</p><div className="ep-actions"><input readOnly value={url(k)} aria-label={`${t} link`} style={{flex:1}} onFocus={e=>e.target.select()}/><Button size="sm" tone="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(url(k));C(k);}catch{}}}>{copied===k?'Copied':'Copy link'}</Button></div></div>)}</div></Card>;
}
