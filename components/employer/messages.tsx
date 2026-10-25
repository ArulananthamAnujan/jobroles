'use client';
import {useEffect,useState} from 'react';
import {employerGet,employerPost,ago} from './api';
import {Avatar,Button,Card,Drawer,Empty,Field,Notice,Tabs} from './ui';
import {Section,type PortalContext} from './portal';
import Candidate from './candidate';
type Thread={application_id:string;job_title:string;full_name:string;last_body:string;last_at:string;last_from_candidate:boolean;unread:number};
type Template={id:string;name:string;body:string};
export default function Messages({ctx}:{ctx:PortalContext}){
 const [threads,T]=useState<Thread[]|null>(null),[templates,TP]=useState<Template[]>([]),[tab,TB]=useState<'inbox'|'templates'>('inbox'),[filter,F]=useState<'all'|'unread'>('all'),[open,O]=useState(''),[narrow,NR]=useState(false),[q,Q]=useState(''),[error,E]=useState(''),[note,N]=useState(''),[version,V]=useState(0);
 const canEdit=ctx.role==='owner'||ctx.role==='recruiter';
 useEffect(()=>{const c=new AbortController();Promise.all([employerGet<{threads:Thread[]}>('inbox',{company:ctx.company.id},c.signal),employerGet<{templates:Template[]}>('templates',{company:ctx.company.id},c.signal)]).then(([a,b])=>{T(a.threads);TP(b.templates);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,version]);
 useEffect(()=>{const m=window.matchMedia('(max-width: 1000px)'),f=()=>NR(m.matches);Promise.resolve().then(f);m.addEventListener('change',f);return()=>m.removeEventListener('change',f);},[]);
 const shown=(threads||[]).filter(t=>(filter==='all'||t.unread>0)&&(!q||`${t.full_name} ${t.job_title}`.toLowerCase().includes(q.toLowerCase())));
 // On a wide screen the first conversation opens beside the list, like an email inbox.
 const active=open||(!narrow&&shown[0]?.application_id)||'';
 const unread=(threads||[]).reduce((n,t)=>n+Number(t.unread),0);
 return <Section title="Messages" sub="Every conversation with applicants, newest first.">
  <Notice error={error} message={note}/>
  <Tabs value={tab} onChange={TB} items={[['inbox','Inbox',unread||undefined],['templates','Templates',templates.length]]}/>
  {tab==='inbox'?<>
   {!threads?<p role="status" className="ep-muted">Loading messages…</p>:threads.length?<div className="ep-inbox">
    <div className="ep-inbox-list">
     <div className="ep-inbox-tools"><input type="search" placeholder="Search people or jobs" value={q} onChange={e=>Q(e.target.value)} aria-label="Search conversations"/><Tabs value={filter} onChange={F} items={[['all','All'],['unread','Unread',unread]]}/></div>
     {shown.length?<ul>{shown.map(t=><li key={t.application_id}><button aria-current={active===t.application_id?'true':undefined} className={t.unread>0?'unread':''} onClick={()=>O(t.application_id)}>
      <Avatar name={t.full_name}/><span className="ep-grow"><span className="ep-inbox-top"><strong>{t.full_name}</strong><small>{ago(t.last_at)}</small></span><small className="ep-inbox-job">{t.job_title}</small>
      <span className="ep-inbox-last">{t.last_from_candidate?'':'You: '}{t.last_body}</span></span>{t.unread>0&&<span className="ep-inbox-dot" aria-label={`${t.unread} unread`}>{t.unread}</span>}</button></li>)}</ul>
     :<Empty title={filter==='unread'?'No unread messages':'No matches'}/>}
    </div>
    {!narrow&&<div className="ep-inbox-pane">{active?<Candidate key={active} id={active} ctx={ctx} templates={templates} onChange={()=>V(v=>v+1)}/>:<Empty title="Choose a conversation"/>}</div>}
   </div>:<div className="ep-card"><Empty title="No conversations yet">Message an applicant from their profile on the Applicants page. Their replies arrive here.</Empty></div>}
  </>:<div className="ep-grid two">
   <Card title="Saved templates">{templates.length?<ul className="ep-list">{templates.map(t=><li key={t.id}><div className="ep-grow"><strong>{t.name}</strong><small style={{whiteSpace:'pre-wrap'}}>{t.body.slice(0,160)}{t.body.length>160?'…':''}</small></div>{canEdit&&<Button size="sm" tone="ghost" onClick={async()=>{try{await employerPost({action:'template.delete',id:t.id});V(v=>v+1);}catch(e){E((e as Error).message);}}}>Delete</Button>}</li>)}</ul>:<Empty title="No templates yet">Save replies you send often, such as an interview invitation or a polite “not progressing” note.</Empty>}</Card>
   {canEdit&&<Card title="New template"><form style={{display:'grid',gap:12}} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget;E('');N('');try{await employerPost({action:'template.save',companyId:ctx.company.id,name:f.get('name'),body:f.get('body')});form.reset();N('Template saved.');V(v=>v+1);}catch(err){E((err as Error).message);}}}>
    <Field label="Name"><input name="name" required minLength={2} maxLength={80} placeholder="Not progressing"/></Field>
    <Field label="Message" hint="Write {name} to insert the applicant’s first name."><textarea name="body" required minLength={10} maxLength={5000} rows={6} defaultValue={'Hi {name},\n\nThank you for applying. We have decided not to progress your application this time. We appreciate your interest and wish you well in your search.\n\nKind regards'}/></Field>
    <div className="ep-actions"><Button>Save template</Button></div></form></Card>}
  </div>}
  <Drawer open={narrow&&Boolean(open)} wide onClose={()=>{O('');V(v=>v+1);}} title={threads?.find(t=>t.application_id===open)?.full_name||'Conversation'}>{open&&<Candidate id={open} ctx={ctx} templates={templates} onChange={()=>{}}/>}</Drawer>
 </Section>;
}
