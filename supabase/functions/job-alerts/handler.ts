// Sends saved-search alerts. Schedule it (for example every 30 minutes) with the worker secret header.
// Matching uses the same query builder as the website (kept identical to lib/search.ts by a test).
import {buildQuery,parseFilters} from '../_shared/search.ts';
import {sendPush} from '../_shared/webpush.ts';
type Env=(name:string)=>string|undefined;
type Claim={id:string;user_id?:string;email:string;filters:Record<string,string>;since:string;checked_at:string;lease:string;token:string};
type Job={id:string;title:string;salary_min:number|null;salary_max:number|null;salary_period:string|null;published_at:string;companies:{name:string};job_locations:{label:string}[]};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:n<1000?2:0}).format(n);
const pay=(j:Job)=>j.salary_min!==null&&j.salary_max!==null?`${money(Number(j.salary_min))}–${money(Number(j.salary_max))} per ${j.salary_period}`:'Pay on listing';
export function alertEmail(claim:Claim,jobs:Job[],origin:string){
 const label=claim.filters.q||'your saved search';
 const search=`${origin}/search?${new URLSearchParams(claim.filters)}`;
 const unsubscribe=`${origin}/alerts/unsubscribe?id=${claim.id}&token=${claim.token}`;
 const lines=jobs.map(j=>`${j.title} · ${j.companies.name} · ${j.job_locations.map(l=>l.label).join(', ')}\n${pay(j)}\n${origin}/jobs/${j.id}`);
 const subject=`${jobs.length} new ${jobs.length===1?'job':'jobs'} for ${label}`.slice(0,120);
 const text=`New roles matching ${label} on JobRoles. Every listing shows its pay.\n\n${lines.join('\n\n')}\n\nSee all results: ${search}\n\nYou get this email because you turned on alerts for this saved search.\nUnsubscribe from this alert: ${unsubscribe}\nJobRoles, an Australian job board.`;
 const html=`<p>New roles matching <strong>${esc(label)}</strong> on JobRoles. Every listing shows its pay.</p>${jobs.map(j=>`<p><a href="${origin}/jobs/${j.id}"><strong>${esc(j.title)}</strong></a><br>${esc(j.companies.name)} · ${esc(j.job_locations.map(l=>l.label).join(', '))}<br><strong>${esc(pay(j))}</strong></p>`).join('')}<p><a href="${esc(search)}">See all results</a></p><p style="color:#555;font-size:13px">You get this email because you turned on alerts for this saved search. <a href="${esc(unsubscribe)}">Unsubscribe from this alert</a>.<br>JobRoles, an Australian job board.</p>`;
 return {subject,text,html,unsubscribeApi:`${origin}/api/alerts/unsubscribe?id=${claim.id}&token=${claim.token}`};
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeAlertWorker(createClient:(url:string,key:string,opts:object)=>any,env:Env,send:typeof fetch=fetch){
 const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async(request:Request)=>{
  if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
  const secret=env('JOB_ALERT_WORKER_SECRET');
  if(!secret||request.headers.get('x-job-alert-secret')!==secret)return reply(401,{error:'Unauthorised'});
  const key=env('RESEND_API_KEY'),from=env('NOTIFICATION_FROM'),origin=env('APP_ORIGIN')?.replace(/\/$/,'');
  if(env('JOB_ALERTS_ENABLED')!=='true'||!key||!from||!origin?.startsWith('https://'))return reply(503,{error:'Job alerts are not configured'});
  const client=createClient(env('SUPABASE_URL')!,env('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:claims,error}=await client.rpc('jp_claim_job_alerts');
  if(error)return reply(503,{error:'Alert queue unavailable'});
  let sent=0,empty=0,failed=0,pushed=0;
  for(const claim of (claims||[]) as Claim[]){
   try{
    const f=parseFilters(new URLSearchParams(claim.filters)),q=buildQuery(f.q,f.sector);
    const min=Number(claim.filters.salaryMin)||null,max=Number(claim.filters.salaryMax)||null;
    const {data:hits,error:searchError}=await client.rpc('jp_search_jobs',{p_query:q?.text??null,p_query_mode:q?.mode??'websearch',p_location:f.location||null,p_company:f.company||null,p_arrangement:f.arrangement||null,p_type:f.type||null,p_salary_min:min,p_salary_max:max,p_period:claim.filters.salaryPeriod||'year',p_posted_days:null,p_near:f.near||null,p_radius_km:f.near?f.radius:null,p_sort:'newest',p_limit:50,p_offset:0});
    if(searchError)throw searchError;
    const idList=((hits||[]) as {job_id:string}[]).map(h=>h.job_id);
    let jobs:Job[]=[];
    if(idList.length){const {data,error:jobError}=await client.from('jobs').select('id,title,salary_min,salary_max,salary_period,published_at,companies(name),job_locations(label)').in('id',idList);if(jobError)throw jobError;
     jobs=((data||[]) as Job[]).filter(j=>j.published_at>claim.since&&j.published_at<=claim.checked_at).sort((a,b)=>b.published_at.localeCompare(a.published_at)).slice(0,10);}
    if(jobs.length){
     const mail=alertEmail(claim,jobs,origin);
     const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`alert-${claim.id}-${claim.checked_at}`},body:JSON.stringify({from,to:[claim.email],subject:mail.subject,text:mail.text,html:mail.html,headers:{'List-Unsubscribe':`<${mail.unsubscribeApi}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),signal:AbortSignal.timeout(15000)});
     if(!r.ok)throw Error('provider');sent++;
     // Also notify the person's browsers and installed apps when push is configured; failures never block email.
     const vapid={publicKey:env('VAPID_PUBLIC_KEY')??'',privateKey:env('VAPID_PRIVATE_KEY')??'',subject:env('VAPID_SUBJECT')??''};
     if(claim.user_id&&vapid.publicKey&&vapid.privateKey&&vapid.subject){
      const {data:subs}=await client.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',claim.user_id);
      for(const sub of (subs||[]) as {id:string;endpoint:string;p256dh:string;auth:string}[]){
       try{const status=await sendPush(sub,{title:mail.subject,body:`${jobs[0].title} · ${jobs[0].companies.name}${jobs.length>1?` and ${jobs.length-1} more`:''}`,url:`/search?${new URLSearchParams(claim.filters)}`},vapid,send);
        if(status===404||status===410)await client.from('push_subscriptions').delete().eq('id',sub.id);else if(status<300)pushed++;}catch{}
      }
     }
    }else empty++;
    await client.rpc('jp_finish_job_alert',{target:claim.id,lease:claim.lease,checked:claim.checked_at});
   }catch{failed++;}
  }
  // Employers who chose a daily digest get one summary of new applicants instead of an email per application.
  let digests=0;
  const {data:due}=await client.rpc('jp_claim_employer_digests');
  for(const d of (Array.isArray(due)?due:[]) as {email:string;jobs:{jobId:string;title:string;count:number}[]}[]){
   if(!d.jobs.length)continue;
   const total=d.jobs.reduce((n,j)=>n+j.count,0);
   const lines=d.jobs.map(j=>`${j.title}: ${j.count} new ${j.count===1?'applicant':'applicants'}\n${origin}/employer?view=applicants&job=${j.jobId}`);
   try{const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[d.email],subject:`${total} new ${total===1?'applicant':'applicants'} on JobRoles`,text:`Your daily applicant summary.\n\n${lines.join('\n\n')}\n\nChange email settings: ${origin}/employer?view=settings\nJobRoles, an Australian job board.`}),signal:AbortSignal.timeout(15000)});if(r.ok)digests++;}catch{}
  }
  return reply(200,{sent,empty,failed,pushed,digests});
 };
}
