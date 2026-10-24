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
   return reply(200,{accepted,failed});
  }catch{return reply(503,{error:'Notification queue unavailable'});}
 };
}
