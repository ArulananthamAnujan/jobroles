'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {get,post,when} from '../employer/api';
import {Button,Card,Empty,Field,Notice,Pill,Stat} from '../employer/ui';
type Source={id:string;companyId:string;company:string;website:string|null;url:string;format:string;active:boolean;autoPublish:boolean;lastRunAt:string|null;lastStatus:string|null;lastError:string|null;live:number;waiting:number;owners:number};
type Data={totals:{live:number;sourced:number;withPay:number;employers:number};sources:Source[]};
type Preview={format:string;url:string;total:number;rejected:number;withPay:number;sample:{title:string;location:string;type:string;pay:string|null}[]};
const SYSTEMS:Record<string,string>={greenhouse:'Greenhouse',lever:'Lever',ashby:'Ashby',smartrecruiters:'SmartRecruiters',xml:'XML feed',json:'JSON feed'};
// Employers whose public boards were read successfully when this screen was built. They are examples, not partners.
const EXAMPLES:[string,string,string][]=[['Culture Amp','https://job-boards.greenhouse.io/cultureamp','https://www.cultureamp.com'],['Airwallex','https://jobs.ashbyhq.com/airwallex','https://www.airwallex.com'],['Canva','https://jobs.smartrecruiters.com/Canva','https://www.canva.com'],['Buildkite','https://job-boards.greenhouse.io/buildkite','https://buildkite.com'],['Prospa','https://job-boards.greenhouse.io/prospa','https://www.prospa.com'],['Up','https://jobs.ashbyhq.com/up','https://up.com.au']];

// Administrators list an employer's public careers feed so the board has roles before that employer joins.
export default function Sourcing(){
 const [data,D]=useState<Data|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(''),[version,V]=useState(0);
 const [form,F]=useState({name:'',source:'',format:'auto',website:'',autoPublish:true}),[preview,P]=useState<Preview|null>(null),[open,O]=useState<{id:string;kind:'claim'|'verify'}|null>(null);
 useEffect(()=>{let live=true;get<{data:Data}>('/api/admin/sourcing').then(r=>{if(live)D(r.data);}).catch(e=>{if(live)E((e as Error).message);});return()=>{live=false;};},[version]);
 async function run(key:string,body:Record<string,unknown>,done:(r:{worker?:string;result?:Preview})=>string){B(key);E('');N('');try{const r=await post<{worker?:string;result?:Preview}>('/api/admin/sourcing',body);N(done(r));V(v=>v+1);return r;}catch(e){E((e as Error).message);return null;}finally{B('');}}
 const later=(w?:string)=>w==='ran'?'The import has run; the counts below are up to date.':'Its roles appear after the next import, usually within the hour.';
 const set=(k:keyof typeof form,v:string|boolean)=>{F(f=>({...f,[k]:v}));if(k==='source'||k==='format')P(null);};
 const taken=new Set((data?.sources||[]).map(s=>s.company.toLowerCase()));
 return <>
  <Notice error={error} message={note}/>
  {data&&<div className="ep-stats"><Stat label="Live jobs" value={data.totals.live} hint="Everything job seekers can find"/><Stat label="From careers sites" value={data.totals.sourced} hint={`${data.totals.employers} ${data.totals.employers===1?'employer':'employers'} listed here`}/><Stat label="Show their pay" value={data.totals.withPay} hint={data.totals.live?`${Math.round(data.totals.withPay/data.totals.live*100)}% of live jobs`:'No live jobs yet'}/><Stat label="Posted by employers" value={data.totals.live-data.totals.sourced} hint="Applied for on JobRoles"/></div>}
  <Card title="Add an employer’s careers feed">
   <p className="ep-muted" style={{marginBottom:14}}>Paste the link to the employer’s careers page on Greenhouse, Lever, Ashby or SmartRecruiters, or an XML or JSON jobs feed. We keep only roles in Australia, refresh them about every hour, close them when the employer does, and send applicants to the employer’s own site.</p>
   <form className="ep-form" onSubmit={e=>{e.preventDefault();void run('add',{action:'add',...form},r=>`${form.name} added. ${later(r.worker)}`).then(r=>{if(r){F({name:'',source:'',format:'auto',website:'',autoPublish:true});P(null);}});}}>
    <Field label="Employer name"><input value={form.name} onChange={e=>set('name',e.target.value)} required minLength={2} maxLength={160} placeholder="e.g. Culture Amp"/></Field>
    <Field label="Employer website (optional)"><input value={form.website} onChange={e=>set('website',e.target.value)} maxLength={300} placeholder="https://www.example.com.au"/></Field>
    <Field label="Careers page or feed link" wide hint="For example https://job-boards.greenhouse.io/company, https://jobs.lever.co/company, https://jobs.ashbyhq.com/company or https://jobs.smartrecruiters.com/Company"><input value={form.source} onChange={e=>set('source',e.target.value)} required maxLength={2000} placeholder="https://job-boards.greenhouse.io/company"/></Field>
    <Field label="System"><select value={form.format} onChange={e=>set('format',e.target.value)}><option value="auto">Work it out from the link</option>{Object.entries(SYSTEMS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></Field>
    <label className="ep-check" style={{gridColumn:'1 / -1'}}><input type="checkbox" checked={form.autoPublish} onChange={e=>set('autoPublish',e.target.checked)}/>Publish roles straight away. Untick to approve each one under Job approvals first.</label>
    <div className="ep-actions"><Button type="button" tone="secondary" disabled={!!busy||form.source.trim().length<2} onClick={async()=>{B('check');E('');N('');try{const r=await post<{result:Preview}>('/api/admin/sourcing',{action:'check',source:form.source,format:form.format});P(r.result);}catch(e){P(null);E((e as Error).message);}finally{B('');}}}>{busy==='check'?'Checking…':'Check the feed first'}</Button><Button disabled={!!busy}>{busy==='add'?'Adding…':'Add employer'}</Button></div>
   </form>
   {preview&&<div className="ep-notice" role="status" style={{marginTop:14}}><p><strong>{preview.total} {preview.total===1?'role':'roles'} in Australia</strong> found on {SYSTEMS[preview.format]||preview.format}. {preview.withPay} {preview.withPay===1?'states':'state'} pay{preview.rejected?`; ${preview.rejected} could not be read and will be skipped`:''}.</p>{preview.sample.length>0&&<ul style={{margin:'8px 0 0',paddingLeft:20}}>{preview.sample.map((s,i)=><li key={i}>{s.title} · {s.location} · {s.type} · {s.pay||'pay not stated'}</li>)}</ul>}{!preview.total&&<p>Nothing would be imported. Check the link, or the employer may have no Australian roles open.</p>}</div>}
   {EXAMPLES.some(([n])=>!taken.has(n.toLowerCase()))&&<p className="ep-muted" style={{marginTop:14,fontSize:13}}>Examples that worked when tested: {EXAMPLES.filter(([n])=>!taken.has(n.toLowerCase())).map(([n,u,w],i)=><span key={n}>{i>0&&' · '}<button type="button" className="text-link" onClick={()=>{F(f=>({...f,name:n,source:u,website:w,format:'auto'}));P(null);}}>{n}</button></span>)}</p>}
  </Card>
  <Card title={`Employers listed from their careers sites${data?` (${data.sources.length})`:''}`}>
   {!data?<p role="status" className="ep-muted">Loading…</p>:!data.sources.length?<Empty title="No careers feeds yet">Add an employer above. Their Australian roles appear in search labelled “From the employer’s careers site”.</Empty>:
   <div className="ep-table-wrap"><table className="ep-table"><thead><tr><th>Employer</th><th>System</th><th>Live</th><th>Last import</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{data.sources.map(s=><tr key={s.id}>
    <td><Link href={`/companies/${s.companyId}`}><strong>{s.company}</strong></Link><div className="ep-muted" style={{fontSize:13}}>{s.owners?'Claimed by the employer, awaiting ABN check':'Not claimed'}</div></td>
    <td>{SYSTEMS[s.format]||s.format}<div className="ep-muted" style={{fontSize:13}}>{s.autoPublish?'Publishes straight away':'Each role is approved first'}</div></td>
    <td>{s.live}{s.waiting>0&&<div className="ep-muted" style={{fontSize:13}}><Link href="/admin?view=jobs">{s.waiting} awaiting approval</Link></div>}</td>
    <td>{!s.active?<Pill tone="blue">Paused</Pill>:s.lastStatus==='failed'?<Pill tone="red">Failed</Pill>:s.lastRunAt?<Pill tone="teal">Working</Pill>:<Pill tone="amber">Waiting for first import</Pill>}<div className="ep-muted" style={{fontSize:13}}>{s.lastRunAt?`${when(s.lastRunAt,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}: ${s.lastError||s.lastStatus}`:'Not imported yet'}</div></td>
    <td><div className="ep-actions" style={{justifyContent:'flex-end'}}>
     <Button size="sm" tone="secondary" disabled={!!busy||!s.active} onClick={()=>run(`run-${s.id}`,{action:'run',id:s.id},r=>`${s.company}: ${r.worker==='ran'?'imported just now.':'queued for the next import.'}`)}>{busy===`run-${s.id}`?'Importing…':'Import now'}</Button>
     <Button size="sm" tone="ghost" disabled={!!busy} onClick={()=>run(`p-${s.id}`,{action:s.active?'pause':'resume',id:s.id},()=>`${s.company} ${s.active?'paused. Its live roles stay up until they expire.':'resumed.'}`)}>{s.active?'Pause':'Resume'}</Button>
     <Button size="sm" tone="ghost" disabled={!!busy} onClick={()=>O(open?.id===s.id?null:{id:s.id,kind:s.owners?'verify':'claim'})}>{s.owners?'Verify ABN':'Hand over'}</Button>
     <Button size="sm" tone="danger" disabled={!!busy} onClick={()=>{if(window.confirm(`Remove ${s.company}’s feed? Its imported roles will close.`))void run(`d-${s.id}`,{action:'delete',id:s.id},()=>`${s.company}’s feed was removed and its roles closed.`);}}>Remove</Button></div>
     {open?.id===s.id&&(open.kind==='claim'?<form className="ep-form" style={{marginTop:10,textAlign:'left'}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run('claim',{action:'claim',companyId:s.companyId,email:f.get('email')},()=>`${s.company} now belongs to that account. Verify its ABN when you have checked it.`).then(r=>{if(r)O(null);});}}><Field label="Employer’s account email" wide hint="They must have signed up and confirmed this email. They become the company’s owner."><input name="email" type="email" required maxLength={254}/></Field><div className="ep-actions"><Button size="sm" disabled={!!busy}>Hand over company</Button></div></form>
      :<form className="ep-form" style={{marginTop:10,textAlign:'left'}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run('verify',{action:'verify',companyId:s.companyId,abn:String(f.get('abn')).replace(/\s/g,''),reason:f.get('reason')},()=>`${s.company} is now a verified employer.`).then(r=>{if(r)O(null);});}}><Field label="ABN" hint="11 digits, checked on the Australian Business Register"><input name="abn" inputMode="numeric" required pattern="[0-9 ]{11,14}"/></Field><Field label="What you checked"><input name="reason" required minLength={3} maxLength={500} defaultValue="ABN active and matches the business name"/></Field><div className="ep-actions"><Button size="sm" disabled={!!busy}>Mark as verified</Button></div></form>)}
    </td></tr>)}</tbody></table></div>}
  </Card>
  <Card title="How this works, and the rules we keep">
   <ul style={{display:'grid',gap:8,paddingLeft:20}}>
    <li>Only list feeds an employer publishes for job boards: their public careers board or a jobs feed they gave you. Never copy listings from other job sites.</li>
    <li>These roles are labelled “From the employer’s careers site”, never “Verified”, and people apply on the employer’s own site.</li>
    <li>Pay is shown whenever the employer states it. Otherwise the role says “Pay not stated by employer”, and job seekers can filter to roles that show pay.</li>
    <li>If an employer asks to be removed, use Remove: its roles close straight away. If they want to manage their page, ask them to sign up, then use Hand over.</li>
    <li>Employers who join can also add their own feed, upload a spreadsheet or post by hand under Import jobs in their portal.</li>
   </ul>
  </Card>
 </>;
}
