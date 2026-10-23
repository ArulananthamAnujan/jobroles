'use client';
import {useEffect,useState} from 'react';
import {Panel,Btn,Field,Badge} from './market-ui';
type Feed={id:string;company_id:string;url:string;format:string;active:boolean;auto_publish:boolean;last_run_at:string|null;last_status:string|null;last_error:string|null};
type Company={id:string;name:string};
// Lets company owners connect an ATS or careers-site feed; administrators can trust a feed to publish without review.
export default function JobFeeds({companies,ownerOf,isAdmin}:{companies:Company[];ownerOf:string[];isAdmin:boolean}){
 const [feeds,F]=useState<Feed[]>([]),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[version,V]=useState(0);
 useEffect(()=>{const c=new AbortController();fetch('/api/feeds',{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json() as {feeds?:Feed[];error?:string};if(!r.ok)throw new Error(d.error);F(d.feeds||[]);}).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[version]);
 async function act(action:string,payload:unknown,done=''){B(true);E('');N('');try{const r=await fetch('/api/feeds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);N(done);V(v=>v+1);}catch(e){E((e as Error).message);}finally{B(false);}}
 const owned=companies.filter(c=>ownerOf.includes(c.id));
 if(!owned.length&&!isAdmin&&!feeds.length)return null;
 return <section aria-labelledby="feeds-title"><h2 id="feeds-title" className="section-title">Import jobs from your ATS</h2>
  <p>Connect a JSON or Indeed-style XML feed and we check it every hour. Each role must include its pay range; roles without pay are skipped. New and changed roles go to review unless the feed is trusted, and roles that leave the feed close automatically.</p>
  {error&&<p role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
  {owned.length>0&&<Panel><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('create',{companyId:f.get('companyId'),url:f.get('url'),format:f.get('format')},'Feed added. The first import runs within the hour.');e.currentTarget.reset();}}>
   <Field label="Company"><select name="companyId">{owned.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
   <Field label="Feed address" hint="Must start with https://. Greenhouse: https://boards-api.greenhouse.io/v1/boards/YOUR-BOARD/jobs?content=true&pay_transparency=true · Lever: https://api.lever.co/v0/postings/YOUR-COMPANY?mode=json"><input name="url" type="url" required maxLength={2000} placeholder="https://careers.example.com.au/jobs.xml"/></Field>
   <Field label="Format"><select name="format"><option value="xml">XML (Indeed format, JobAdder, PageUp and most ATS exports)</option><option value="json">JSON</option><option value="greenhouse">Greenhouse job board API</option><option value="lever">Lever postings API</option></select></Field>
   <Btn disabled={busy}>Add feed</Btn></form></Panel>}
  <div className="grid-three">{feeds.map(f=><Panel key={f.id}><Badge tone={f.last_status==='failed'?'amber':'teal'}>{f.active?f.last_status==='failed'?'Last import failed':'Active':'Paused'}</Badge><h3>{companies.find(c=>c.id===f.company_id)?.name||'Company'}</h3><p style={{overflowWrap:'anywhere'}}>{f.url}</p><p>{f.format.toUpperCase()} · {f.auto_publish?'Trusted: publishes without review':'New roles go to review'}</p><p className="muted">{f.last_run_at?`Last checked ${new Date(f.last_run_at).toLocaleString('en-AU')}: ${f.last_status}`:'Not checked yet'}</p>{f.last_error&&<p role="alert">{f.last_error}</p>}
   {ownerOf.includes(f.company_id)&&<><Btn secondary disabled={busy} onClick={()=>act(f.active?'pause':'resume',{id:f.id})}>{f.active?'Pause feed':'Resume feed'}</Btn><Btn secondary disabled={busy} onClick={()=>{if(window.confirm('Remove this feed? Roles imported from it will close.'))void act('delete',{id:f.id},'Feed removed and its roles closed.');}}>Remove feed</Btn></>}
   {isAdmin&&<Btn secondary disabled={busy} onClick={()=>act('trust',{id:f.id,autoPublish:!f.auto_publish})}>{f.auto_publish?'Require review again':'Trust feed (publish without review)'}</Btn>}
  </Panel>)}</div></section>;
}
