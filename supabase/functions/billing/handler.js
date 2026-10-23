// Stripe billing for sponsored listings. Two routes:
//  POST .../billing/checkout  with the employer's own token; checks permission, returns a Checkout URL.
//  POST .../billing/webhook   called by Stripe; the signature is verified before anything is recorded.
// Deploy with verify_jwt:false (Stripe cannot send a Supabase JWT); /checkout validates the token itself.
const enc=new TextEncoder();
async function hmacHex(secret,message){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function safeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()/1000,tolerance=300){
 if(!header||!secret)return false;
 const parts=header.split(',').map(p=>p.split('=')),t=Number(parts.find(([k])=>k==='t')?.[1]),signatures=parts.filter(([k])=>k==='v1').map(([,v])=>v);
 if(!Number.isFinite(t)||Math.abs(now-t)>tolerance||!signatures.length)return false;
 const expected=await hmacHex(secret,`${t}.${raw}`);
 return signatures.some(s=>safeEqual(s,expected));
}
export function makeBillingHandler(createClient,env,send=fetch){
 const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  if(request.method!=='POST')return reply(405,{error:'Method not allowed.'});
  const path=new URL(request.url).pathname,url=env('SUPABASE_URL');
  const service=()=>createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  if(path.endsWith('/webhook')){
   const raw=await request.text();
   if(raw.length>256*1024||!(await verifyStripeSignature(raw,request.headers.get('stripe-signature'),env('STRIPE_WEBHOOK_SECRET'))))return reply(400,{error:'Invalid signature.'});
   const event=JSON.parse(raw),session=event.data?.object;
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)||session?.payment_status!=='paid'||session?.metadata?.purpose!=='sponsor')return reply(200,{ignored:true});
   const {error}=await service().rpc('jp_record_sponsorship',{session:session.id,target:session.metadata.job_id,buyer:session.metadata.user_id,amount:session.amount_total??0,cur:session.currency??'aud',days:Number(session.metadata.days)||30});
   // A 5xx makes Stripe retry; recording is idempotent per session.
   return error?reply(500,{error:'Could not record the sponsorship.'}):reply(200,{recorded:true});
  }
  if(path.endsWith('/checkout')){
   const key=env('STRIPE_SECRET_KEY'),price=env('STRIPE_PRICE_SPONSOR'),origin=env('APP_ORIGIN')?.replace(/\/$/,'');
   if(!key||!price||!origin)return reply(503,{error:'Sponsored listings are not available yet.'});
   const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return reply(401,{error:'Sign in required.'});
   const user=createClient(url,env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:identity,error:authError}=await user.auth.getUser(authorization.slice(7));
   if(authError||!identity.user?.email_confirmed_at)return reply(401,{error:'Confirmed account required.'});
   let jobId;try{({jobId}=JSON.parse(await request.text()));}catch{return reply(400,{error:'Invalid request.'});}
   if(typeof jobId!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(jobId))return reply(400,{error:'Choose a role.'});
   const {data:allowed,error:permissionError}=await user.rpc('jp_can_sponsor',{target:jobId});
   if(permissionError)return reply(permissionError.code==='22023'?409:403,{error:permissionError.code==='22023'?permissionError.message:'Only owners and recruiters can sponsor this role.'});
   const days=String(Number(env('SPONSOR_DAYS'))||30);
   const form=new URLSearchParams({mode:'payment','line_items[0][price]':price,'line_items[0][quantity]':'1',success_url:`${origin}/employer?view=hiring&sponsored=1`,cancel_url:`${origin}/employer?view=hiring`,customer_email:identity.user.email,client_reference_id:jobId,'invoice_creation[enabled]':'true','tax_id_collection[enabled]':'true',
    'metadata[purpose]':'sponsor','metadata[job_id]':jobId,'metadata[user_id]':identity.user.id,'metadata[days]':days,'payment_intent_data[description]':`Sponsored listing: ${String(allowed.title).slice(0,80)}`});
   const r=await send('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`sponsor-${jobId}-${identity.user.id}-${Math.floor(Date.now()/600000)}`},body:form,signal:AbortSignal.timeout(15000)});
   const session=await r.json();
   if(!r.ok||typeof session.url!=='string')return reply(502,{error:'Checkout is unavailable right now.'});
   return reply(200,{url:session.url});
  }
  return reply(404,{error:'Not found.'});
 };
}
