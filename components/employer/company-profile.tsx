'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {employerGet,employerPost} from './api';
import {Button,Card,Field,Icon,Notice} from './ui';
import {Section,type PortalContext} from './portal';
type Profile={id:string;name:string;about:string;abn:string|null;verified_at:string|null;logo_url:string|null;cover_url:string|null;website:string|null;industry:string|null;size_band:string|null;headquarters:string|null;founded_year:number|null;pitch:string|null;benefits:string[];photos:string[]};
const SIZES=['1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+'];
const SUGGESTED=['Salary packaging','Flexible hours','Work from home','Paid parental leave','Study support','Employee assistance program','Free parking','Career progression','Extra annual leave','Health and wellbeing program'];
async function upload(companyId:string,file:File){const f=new FormData();f.append('companyId',companyId);f.append('file',file);const r=await fetch('/api/company-media',{method:'POST',body:f});const d=await r.json() as {url?:string;error?:string};if(!r.ok||!d.url)throw new Error(d.error||'Upload failed.');return d.url;}
export default function CompanyProfile({ctx}:{ctx:PortalContext}){
 const [p,P]=useState<Profile|null>(null),[error,E]=useState(''),[note,N]=useState(''),[busy,B]=useState(false),[benefit,BN]=useState('');
 const owner=ctx.role==='owner';
 useEffect(()=>{const c=new AbortController();employerGet<{company:Profile}>('company',{company:ctx.company.id},c.signal).then(d=>P(d.company)).catch(e=>{if(e.name!=='AbortError')E(e.message);});return()=>c.abort();},[ctx.company.id]);
 if(!p)return <Section title="Company page"><Notice error={error}/>{!error&&<p role="status">Loading…</p>}</Section>;
 const set=(k:keyof Profile,v:unknown)=>P({...p,[k]:v});
 async function media(kind:'logo_url'|'cover_url'|'photos',files:FileList|null){if(!files?.length)return;B(true);E('');try{if(kind==='photos'){const urls:string[]=[];for(const f of [...files].slice(0,12-p!.photos.length))urls.push(await upload(ctx.company.id,f));P({...p!,photos:[...p!.photos,...urls]});}else P({...p!,[kind]:await upload(ctx.company.id,files[0])});N('Uploaded. Save to publish the change.');}catch(e){E((e as Error).message);}finally{B(false);}}
 async function save(){B(true);E('');N('');try{await employerPost({action:'profile',companyId:p!.id,profile:{about:p!.about||'',logoUrl:p!.logo_url||'',coverUrl:p!.cover_url||'',website:p!.website||'',industry:p!.industry||'',sizeBand:p!.size_band||'',headquarters:p!.headquarters||'',foundedYear:p!.founded_year?String(p!.founded_year):'',pitch:p!.pitch||'',benefits:p!.benefits,photos:p!.photos}});N('Company page updated.');}catch(e){E((e as Error).message);}finally{B(false);}}
 const addBenefit=(b:string)=>{const v=b.trim();if(v&&!p.benefits.includes(v)&&p.benefits.length<20)set('benefits',[...p.benefits,v]);BN('');};
 return <Section title="Company page" sub="What job seekers see about you. A complete page gets more applications." actions={<><Link className="ep-btn secondary md" href={`/companies/${p.id}`} target="_blank">View public page</Link>{owner&&<Button disabled={busy} onClick={save}>Save changes</Button>}</>}>
  <Notice error={error} message={note}/>
  {!owner&&<p className="ep-notice">Only the company owner can edit this page.</p>}
  <div className="ep-over">
  <fieldset disabled={!owner||busy} style={{border:0,padding:0,margin:0,display:'grid',gap:16,minWidth:0}}>
   <Card title="Branding">
    <div className="ep-cover" style={{backgroundImage:p.cover_url?`url(${p.cover_url})`:undefined}} role="img" aria-label="Cover image"/>
    <div className="ep-actions" style={{marginTop:12}}><div className="ep-logo" style={{backgroundImage:p.logo_url?`url(${p.logo_url})`:undefined}} role="img" aria-label="Logo"/>
     <label className="ep-btn secondary sm">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>media('logo_url',e.target.files)}/></label>
     <label className="ep-btn secondary sm">Upload cover<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>media('cover_url',e.target.files)}/></label>
     {(p.logo_url||p.cover_url)&&<Button size="sm" tone="ghost" type="button" onClick={()=>P({...p,logo_url:null,cover_url:null})}>Remove images</Button>}
     <span className="ep-muted">JPEG, PNG or WebP, up to 5 MB. Logo square; cover about 1500×400.</span></div>
   </Card>
   <Card title="About">
    <div className="ep-form">
     <Field label="Company name" hint={p.verified_at?'Verified. Contact support to change the legal name.':'Set when you registered.'}><input value={p.name} disabled/></Field>
     <Field label="ABN"><input value={p.abn||''} disabled/></Field>
     <Field label="Why work here" wide hint="Two or three sentences shown at the top of your page."><textarea value={p.pitch||''} maxLength={2000} rows={3} onChange={e=>set('pitch',e.target.value)}/></Field>
     <Field label="About the company" wide><textarea value={p.about||''} maxLength={5000} rows={6} onChange={e=>set('about',e.target.value)}/></Field>
     <Field label="Website"><input type="url" value={p.website||''} placeholder="https://" maxLength={300} onChange={e=>set('website',e.target.value)}/></Field>
     <Field label="Industry"><input value={p.industry||''} maxLength={80} placeholder="e.g. Health care" onChange={e=>set('industry',e.target.value)}/></Field>
     <Field label="Company size"><select value={p.size_band||''} onChange={e=>set('size_band',e.target.value)}><option value="">Not shown</option>{SIZES.map(s=><option key={s} value={s}>{s} employees</option>)}</select></Field>
     <Field label="Headquarters"><input value={p.headquarters||''} maxLength={120} placeholder="e.g. Frankston VIC" onChange={e=>set('headquarters',e.target.value)}/></Field>
     <Field label="Year founded"><input type="number" min={1788} max={2100} value={p.founded_year??''} onChange={e=>set('founded_year',e.target.value?Number(e.target.value):null)}/></Field>
    </div>
   </Card>
   <Card title="Benefits">
    <div className="ep-chips">{p.benefits.map(b=><span key={b}>{b}<button type="button" aria-label={`Remove ${b}`} onClick={()=>set('benefits',p.benefits.filter(x=>x!==b))}>×</button></span>)}</div>
    <div className="ep-actions" style={{marginTop:10}}><input value={benefit} onChange={e=>BN(e.target.value)} maxLength={80} placeholder="Add a benefit" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addBenefit(benefit);}}}/><Button type="button" size="sm" tone="secondary" onClick={()=>addBenefit(benefit)}>Add</Button></div>
    <div className="ep-chips" style={{marginTop:10}}>{SUGGESTED.filter(s=>!p.benefits.includes(s)).map(s=><button key={s} type="button" className="ep-btn ghost sm" onClick={()=>addBenefit(s)}>+ {s}</button>)}</div>
   </Card>
   <Card title="Workplace photos" action={<label className="ep-btn secondary sm">Add photos<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>media('photos',e.target.files)}/></label>}>
    {p.photos.length?<div className="ep-photos">{p.photos.map(u=><figure key={u}>
     {/* eslint-disable-next-line @next/next/no-img-element */}
     <img src={u} alt="Workplace" loading="lazy"/><Button type="button" size="sm" tone="danger" onClick={()=>set('photos',p.photos.filter(x=>x!==u))}>Remove</Button></figure>)}</div>:<p className="ep-muted">Show your workplace and team. Up to 12 photos. Don’t include people who haven’t agreed to appear.</p>}
   </Card>
   {owner&&<div className="ep-actions"><Button disabled={busy} onClick={save}>Save changes</Button></div>}
  </fieldset>
  <Strength p={p}/>
  </div>
 </Section>;
}

// What makes a company page convincing, checked as the owner edits, beside a preview of how it shows in search.
function Strength({p}:{p:Profile}){
 const checks:[boolean,string][]=[[Boolean(p.logo_url),'Logo'],[Boolean(p.cover_url),'Cover image'],[(p.pitch||'').trim().length>=60,'Why work here, two or three sentences'],[(p.about||'').trim().length>=200,'About the company, 200 characters or more'],
  [Boolean(p.website),'Website'],[Boolean(p.industry&&p.size_band&&p.headquarters),'Industry, size and headquarters'],[p.benefits.length>=3,'At least 3 benefits'],[p.photos.length>=3,'At least 3 workplace photos']];
 const done=checks.filter(c=>c[0]).length;
 return <aside className="ep-rail" aria-label="Page strength">
  <h2>Page strength<span className="ep-muted" style={{fontSize:13,fontWeight:500}}>{done} of {checks.length}</span></h2>
  <Card><div className="ep-record" style={{paddingBottom:4}}><div className="ep-record-bar" aria-hidden="true"><i style={{width:`${done/checks.length*100}%`}}/></div>
   <p>{done===checks.length?'Your page is complete.':'Pages with a logo, photos and benefits get noticeably more applications.'}</p></div>
   <ul className="sk-checks">{checks.map(([ok,l])=><li key={l} className={ok?'':'todo'}>{ok?<Icon name="check"/>:<i aria-hidden="true"/>}<span>{l}<span className="visually-hidden">{ok?', done':', to do'}</span></span></li>)}</ul></Card>
  <h2>How you appear in search</h2>
  <Card><div className="ep-preview-co">
   <span className="ep-preview-logo" style={{backgroundImage:p.logo_url?`url(${p.logo_url})`:undefined}}>{p.logo_url?'':p.name.slice(0,2).toUpperCase()}</span>
   <div><strong>{p.name}</strong>{p.verified_at&&<span className="ep-pill teal" style={{marginLeft:6}}>Verified</span>}<small>{[p.industry,p.headquarters,p.size_band&&`${p.size_band} employees`].filter(Boolean).join(' · ')||'Add your industry, size and headquarters'}</small></div></div>
   <p style={{fontSize:13,margin:'10px 0 4px'}}>{p.pitch||<span className="ep-muted">Your “why work here” appears here.</span>}</p>
   {p.benefits.length>0&&<div className="ep-chips" style={{margin:'8px 0 12px'}}>{p.benefits.slice(0,4).map(b=><span key={b}>{b}</span>)}{p.benefits.length>4&&<span>+{p.benefits.length-4}</span>}</div>}
  </Card>
 </aside>;
}
