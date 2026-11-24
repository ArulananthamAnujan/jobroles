// Subject and body for an application notification. It names the job and what happened, but never includes
// message text, resumes or interview details: people sign in to read those.
export function notificationEmail(d,info,origin){
 const job=info?.title?`${info.title}${info.company?` at ${info.company}`:''}`:'an application';
 const who=info?.company||'The employer';
 const seeker={'message.send':`${who} sent you a message`,'application.interview':`Interview update for ${job}`,'application.move':`Update on your application for ${job}`,'application.reinstate':`Your application for ${job} was reinstated`};
 const team={'application.submitted':`New applicant for ${info?.title||'your job'}`,'message.send':`New message from an applicant for ${info?.title||'your job'}`,'application.withdraw':`An applicant withdrew from ${info?.title||'your job'}`,'application.request_reinstatement':`An applicant asked to be reconsidered for ${info?.title||'your job'}`,'application.interview':`Interview update for ${info?.title||'your job'}`};
 const subject=(info?.seeker?seeker:team)[d.event_type]||`Update on ${job}`;
 const link=`${origin}/account/applications/${d.application_id}`;
 return {subject,text:`${subject}.\n\nSign in to see the details:\n${link}\n\nJobRoles\nFor your privacy, this email never includes messages, resumes or interview details. Change which emails you get in your account settings.`};
}
// The email that invites someone to a company's hiring team. The link carries the invitation's secret after "#", so
// it is never sent to a server. It works for the invited address only and the page helps a newcomer create an account.
const ROLE_NAME={recruiter:'a recruiter',hiring_manager:'a hiring manager',owner:'an owner'};
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const clean=t=>String(t||'').replace(/[\r\n\u2028\u2029]+/g,' ').trim().slice(0,160);
export function invitationEmail(inv,origin){
 const company=clean(inv.company)||'A company',inviter=clean(inv.inviter),role=ROLE_NAME[inv.role]||'a team member';
 const link=`${origin}/account/invite#${inv.token}`,who=inviter?`${inviter} from ${company}`:company;
 const until=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',timeZone:'Australia/Melbourne'}).format(new Date(inv.expires_at));
 const subject=`${company} invited you to their hiring team on JobRoles`;
 const text=`${who} has invited you to join ${company}'s hiring team on JobRoles as ${role}.\n\nAccept the invitation:\n${link}\n\nThe link works until ${until}, for ${inv.email} only. If you don't have a JobRoles account yet, the page will help you create one first.\n\nIf you weren't expecting this, you can ignore this email and nothing will happen.\n\nJobRoles`;
 const html=`<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#172b3a;max-width:560px"><p>${esc(who)} has invited you to join <strong>${esc(company)}</strong>'s hiring team on JobRoles as ${esc(role)}.</p><p style="margin:24px 0"><a href="${esc(link)}" style="background:#076d65;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px;display:inline-block">Accept invitation</a></p><p>The link works until ${esc(until)}, for ${esc(inv.email)} only. If you don't have a JobRoles account yet, the page will help you create one first.</p><p style="color:#425563;font-size:14px">If the button doesn't work, copy this address into your browser:<br>${esc(link)}</p><p style="color:#425563;font-size:14px">If you weren't expecting this, you can ignore this email and nothing will happen.</p><p>JobRoles</p></div>`;
 return {subject,text,html};
}
export function makeMailWorker(createClient,env,send=fetch){
 const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
  // Deploy with verify_jwt:true; the gateway validates the scheduler JWT.
  const secret=env('NOTIFICATION_WORKER_SECRET');
  if(!secret||!request.headers.get('authorization')?.startsWith('Bearer ')||request.headers.get('x-notification-worker-secret')!==secret)return reply(401,{error:'Unauthorised'});
  const key=env('RESEND_API_KEY'),from=env('NOTIFICATION_FROM'),origin=env('APP_ORIGIN');
  if(env('NOTIFICATION_EMAIL_ENABLED')!=='true'||!key||!from||!origin)return reply(503,{error:'Notification email is not configured'});
  let base;try{base=new URL(origin);if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error();}catch{return reply(503,{error:'Invalid application origin'});}
  try{
   const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:deliveries,error}=await client.rpc('jp_claim_notification_mail');if(error)throw error;
   let accepted=0,failed=0;
   for(const d of deliveries||[]){
    let ok=false,reference=null;
    try{
     let info=null;try{const {data}=await client.from('applications').select('seeker_id,jobs(title,companies(name))').eq('id',d.application_id).maybeSingle();if(data)info={seeker:data.seeker_id===d.recipient_id,title:data.jobs?.title,company:data.jobs?.companies?.name};}catch{}
     const mail=notificationEmail(d,info,base.origin);
     const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`jobroles-${d.id}`},body:JSON.stringify({from,to:[d.recipient_email],subject:mail.subject,text:mail.text}),signal:AbortSignal.timeout(15000)});
     const result=await r.json();ok=r.ok&&typeof result.id==='string';if(ok)reference=result.id;
    }catch{}
    const done=await client.rpc('jp_finish_notification_mail',{delivery_id:d.id,lease:d.lease_token,accepted:ok,provider_reference:reference});
    if(done.error||done.data!==true)return reply(503,{error:'Delivery acknowledgement failed; retry with the same idempotency key'});
    if(ok)accepted++;else failed++;
   }
   // Team invitations. On a database without that update the queue does not exist yet: skip it.
   let invited=0,invitesFailed=0;
   const claim=await client.rpc('jp_claim_invitation_mail');
   for(const inv of !claim.error&&Array.isArray(claim.data)?claim.data:[]){
    let ok=false,problem='Email was not accepted';
    try{
     const mail=invitationEmail(inv,base.origin);
     const r=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`jobroles-invite-${inv.id}-${inv.lease_token}`},body:JSON.stringify({from,to:[inv.email],subject:mail.subject,text:mail.text,html:mail.html}),signal:AbortSignal.timeout(15000)});
     const result=await r.json().catch(()=>({}));ok=r.ok&&typeof result.id==='string';if(!ok)problem=`Mail provider answered ${r.status}${typeof result.message==='string'?`: ${result.message}`:''}`;
    }catch(e){problem='Mail provider could not be reached';}
    const done=await client.rpc('jp_finish_invitation_mail',{mail_id:inv.id,lease:inv.lease_token,accepted:ok,problem:ok?null:problem});
    if(done.error)return reply(503,{error:'Invitation acknowledgement failed'});
    if(ok)invited++;else invitesFailed++;
   }
   return reply(200,{accepted,failed,invited,invitesFailed});
  }catch{return reply(503,{error:'Notification queue unavailable'});}
 };
}
