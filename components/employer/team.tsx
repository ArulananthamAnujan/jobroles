'use client';
import {useEffect,useState} from 'react';
import {employerGet,employerPost,command,post,when} from './api';
import {Button,Card,Empty,Field,Notice,Pill} from './ui';
import {Section,type PortalContext} from './portal';
type TeamData={members:{userId:string;email:string;role:string;assignedJobs:number}[];invitations:{id:string;email:string;role:string;expiresAt:string}[];isOwner:boolean};
const ROLE:Record<string,string>={owner:'Owner',recruiter:'Recruiter',hiring_manager:'Hiring manager'};
export default function Team({ctx}:{ctx:PortalContext}){
 const [team,T]=useState<TeamData|null>(null),[jobs,J]=useState<{id:string;title:string;state:string}[]>([]),[link,L]=useState(''),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[version,V]=useState(0);
 useEffect(()=>{const c=new AbortController();Promise.all([employerGet<TeamData>('team',{company:ctx.company.id},c.signal),employerGet<{jobs:{id:string;title:string;state:string}[]}>('jobs',{company:ctx.company.id},c.signal)]).then(([t,j])=>{T(t);J(j.jobs.filter(x=>!['closed','expired'].includes(x.state)));}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id,version]);
 async function run(fn:()=>Promise<unknown>,done:string){B(true);E('');N('');try{await fn();N(done);V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 return <Section title="Team" sub="Owners manage everything. Recruiters manage their assigned jobs and applicants. Hiring managers can read and add notes on assigned jobs.">
  <Notice error={error} message={note}/>
  {!team?<p role="status">Loading team…</p>:<div className="ep-grid" style={{gap:16}}>
   <div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Member</th><th>Role</th><th className="num">Assigned jobs</th><th/></tr></thead><tbody>{team.members.map(m=><tr key={m.userId}><td><div className="ep-row-title">{m.email}</div>{m.userId===ctx.userId&&<div className="ep-row-sub">You</div>}</td><td><Pill tone={m.role==='owner'?'teal':'neutral'}>{ROLE[m.role]??m.role}</Pill></td><td className="num">{m.role==='owner'?'All':m.assignedJobs}</td>
    <td><div className="ep-row-actions">{team.isOwner&&m.role!=='owner'&&<Button size="sm" tone="danger" disabled={busy} onClick={()=>{if(window.confirm(`Remove ${m.email}? They lose access straight away.`))void run(()=>command('member.remove',{companyId:ctx.company.id,userId:m.userId}),'Access removed.');}}>Remove</Button>}</div></td></tr>)}</tbody></table></div>
   {team.isOwner&&<div className="ep-grid two">
    <Card title="Invite a team member"><form style={{display:'grid',gap:12}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),form=e.currentTarget;void run(async()=>{const r=await post<{invitationUrl?:string}>('/api/team',{action:'invite',companyId:ctx.company.id,email:f.get('email'),role:f.get('role')});L(r.invitationUrl||'');form.reset();},'Invitation created. Send the link to your colleague.');}}>
     <Field label="Email"><input name="email" type="email" required maxLength={254}/></Field>
     <Field label="Role"><select name="role"><option value="recruiter">Recruiter</option><option value="hiring_manager">Hiring manager</option></select></Field>
     <div className="ep-actions"><Button disabled={busy}>Create invitation link</Button></div></form>
     {link&&<div className="ep-notice" style={{marginTop:12}}><p>Share this link privately. It works once, for that email, for 7 days.</p><div className="ep-actions"><input readOnly value={link} aria-label="Invitation link" onFocus={e=>e.target.select()} style={{flex:1}}/><Button size="sm" tone="secondary" onClick={()=>navigator.clipboard?.writeText(link).then(()=>N('Link copied.')).catch(()=>{})}>Copy</Button></div></div>}</Card>
    <Card title="Pending invitations">{team.invitations.length?<ul className="ep-list">{team.invitations.map(i=><li key={i.id}><div className="ep-grow"><strong>{i.email}</strong><small>{ROLE[i.role]} · expires {when(i.expiresAt)}</small></div><Button size="sm" tone="ghost" disabled={busy} onClick={()=>run(()=>employerPost({action:'invite.revoke',id:i.id}),'Invitation cancelled.')}>Cancel</Button></li>)}</ul>:<Empty title="No pending invitations"/>}</Card>
    <Card title="Assign people to jobs"><form style={{display:'grid',gap:12}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const assigned=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='add';void run(()=>post('/api/team',{action:'assign',jobId:f.get('jobId'),userId:f.get('userId'),assigned}),assigned?'Assigned to the job.':'Removed from the job.');}}>
     <Field label="Team member"><select name="userId">{team.members.filter(m=>m.role!=='owner').map(m=><option key={m.userId} value={m.userId}>{m.email} · {ROLE[m.role]}</option>)}</select></Field>
     <Field label="Job"><select name="jobId">{jobs.map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
     <div className="ep-actions"><Button value="add" disabled={busy||!jobs.length||team.members.every(m=>m.role==='owner')}>Assign</Button><Button value="remove" tone="ghost" disabled={busy||!jobs.length}>Unassign</Button></div></form></Card>
   </div>}
  </div>}
 </Section>;
}
