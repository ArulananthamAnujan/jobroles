'use client';
import {useEffect,useState} from 'react';
import {employerGet,employerPost,ago} from './api';
import {Button,Card,Drawer,Empty,Field,Notice,Pill,Tabs} from './ui';
import {Section,type PortalContext} from './portal';
import Candidate from './candidate';
type Thread={application_id:string;job_title:string;full_name:string;last_body:string;last_at:string;last_from_candidate:boolean;unread:number};
type Template={id:string;name:string;body:string};
export default function Messages({ctx}:{ctx:PortalContext}){
 const [threads,T]=useState<Thread[]|null>(null),[templates,TP]=useState<Template[]>([]),[tab,TB]=useState<'inbox'|'templates'>('inbox'),[filter,F]=useState<'all'|'unread'>('all'),[open,O]=useState(''),[error,E]=useState(''),[note,N]=useState(''),[version,V]=useState(0);
 const canEdit=ctx.role==='owner'||ctx.role==='recruiter';
 useEffect(()=>{const c=new AbortController();Promise.all([employerGet<{threads:Thread[]}>('inbox',{company:ctx.company.id},c.signal),employerGet<{templates:Template[]}>('templates',{company:ctx.company.id},c.signal)]).then(([a,b])=>{T(a.threads);TP(b.templates);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,version]);
 const shown=(threads||[]).filter(t=>filter==='all'||t.unread>0);
 const unread=(threads||[]).reduce((n,t)=>n+Number(t.unread),0);
 return <Section title="Messages" sub="Every conversation with applicants, newest first.">
  <Notice error={error} message={note}/>
  <Tabs value={tab} onChange={TB} items={[['inbox','Inbox',unread],['templates','Templates',templates.length]]}/>
  {tab==='inbox'?<>
   <div className="ep-toolbar"><Tabs value={filter} onChange={F} items={[['all','All'],['unread','Unread']]}/></div>
   {!threads?<p role="status">Loading messages…</p>:shown.length?<div className="ep-card"><ul className="ep-list">{shown.map(t=><li key={t.application_id}><div className="ep-grow"><strong>{t.full_name}{t.unread>0&&<> <Pill tone="blue">{t.unread} new</Pill></>}</strong><small>{t.job_title} · {t.last_from_candidate?'':'You: '}{t.last_body}</small></div><small>{ago(t.last_at)}</small><Button size="sm" tone="secondary" onClick={()=>O(t.application_id)}>Open</Button></li>)}</ul></div>
    :<div className="ep-card"><Empty title={filter==='unread'?'No unread messages':'No conversations yet'}>Message an applicant from their profile on the Applicants page.</Empty></div>}
  </>:<div className="ep-grid two">
   <Card title="Saved templates">{templates.length?<ul className="ep-list">{templates.map(t=><li key={t.id}><div className="ep-grow"><strong>{t.name}</strong><small style={{whiteSpace:'pre-wrap'}}>{t.body.slice(0,160)}{t.body.length>160?'…':''}</small></div>{canEdit&&<Button size="sm" tone="ghost" onClick={async()=>{try{await employerPost({action:'template.delete',id:t.id});V(v=>v+1);}catch(e){E((e as Error).message);}}}>Delete</Button>}</li>)}</ul>:<Empty title="No templates yet">Save replies you send often, such as an interview invitation or a polite “not progressing” note.</Empty>}</Card>
   {canEdit&&<Card title="New template"><form style={{display:'grid',gap:12}} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget;E('');N('');try{await employerPost({action:'template.save',companyId:ctx.company.id,name:f.get('name'),body:f.get('body')});form.reset();N('Template saved.');V(v=>v+1);}catch(err){E((err as Error).message);}}}>
    <Field label="Name"><input name="name" required minLength={2} maxLength={80} placeholder="Not progressing"/></Field>
    <Field label="Message" hint="Write {name} to insert the applicant’s first name."><textarea name="body" required minLength={10} maxLength={5000} rows={6} defaultValue={'Hi {name},\n\nThank you for applying. We have decided not to progress your application this time. We appreciate your interest and wish you well in your search.\n\nKind regards'}/></Field>
    <div className="ep-actions"><Button>Save template</Button></div></form></Card>}
  </div>}
  <Drawer open={Boolean(open)} wide onClose={()=>{O('');V(v=>v+1);}} title={threads?.find(t=>t.application_id===open)?.full_name||'Conversation'}>{open&&<Candidate id={open} ctx={ctx} templates={templates} onChange={()=>{}}/>}</Drawer>
 </Section>;
}
