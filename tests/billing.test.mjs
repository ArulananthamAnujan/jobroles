import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {makeBillingHandler,verifyStripeSignature} from '../supabase/functions/billing/handler.js';
const job='00000000-0000-4000-8000-000000000011';
const sign=(raw,t=Math.floor(Date.now()/1000),secret='whsec')=>`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex')}`;
function setup({canSponsor=true,env={}}={}){
 const calls=[];
 const client=(_u,key)=>key==='service'?{rpc:async(n,a)=>{calls.push([n,a]);return {data:{id:'s'},error:null};}}:{auth:{getUser:async()=>({data:{user:{id:'u1',email:'boss@bayside.example',email_confirmed_at:'x'}},error:null})},rpc:async()=>canSponsor?{data:{jobId:job,title:'Registered Nurse'},error:null}:{data:null,error:{code:'42501'}}};
 const send=async(url,init)=>{calls.push(['stripe',url,Object.fromEntries(new URLSearchParams(init.body))]);return Response.json({url:'https://checkout.stripe.com/c/1'});};
 const values={SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',STRIPE_SECRET_KEY:'sk',STRIPE_PRICE_SPONSOR:'price_1',STRIPE_WEBHOOK_SECRET:'whsec',APP_ORIGIN:'https://jobroles.example',...env};
 return {handler:makeBillingHandler(client,n=>values[n],send),calls};
}
const event=(over={})=>JSON.stringify({type:'checkout.session.completed',data:{object:{id:'cs_1',payment_status:'paid',amount_total:9900,currency:'aud',metadata:{purpose:'sponsor',job_id:job,user_id:'u1',days:'30'},...over}}});
const hook=(raw,sig)=>new Request('https://fn/billing/webhook',{method:'POST',headers:{'stripe-signature':sig},body:raw});
test('signatures must match, be fresh and use the webhook secret',async()=>{
 const raw=event();assert.equal(await verifyStripeSignature(raw,sign(raw),'whsec'),true);
 assert.equal(await verifyStripeSignature(raw,sign(raw,Math.floor(Date.now()/1000)-600),'whsec'),false);
 assert.equal(await verifyStripeSignature(raw,sign(raw,undefined,'other'),'whsec'),false);
 assert.equal(await verifyStripeSignature(raw+' ',sign(raw),'whsec'),false);
});
test('a forged webhook records nothing',async()=>{const s=setup();const raw=event();assert.equal((await s.handler(hook(raw,'t=1,v1=00'))).status,400);assert.equal(s.calls.length,0);});
test('a paid checkout records the sponsorship',async()=>{const s=setup();const raw=event();const r=await s.handler(hook(raw,sign(raw)));assert.equal(r.status,200);assert.deepEqual(s.calls,[['jp_record_sponsorship',{session:'cs_1',target:job,buyer:'u1',amount:9900,cur:'aud',days:30}]]);});
test('unpaid or unrelated sessions are ignored',async()=>{const s=setup();for(const raw of [event({payment_status:'unpaid'}),event({metadata:{purpose:'other'}})]){const r=await s.handler(hook(raw,sign(raw)));assert.deepEqual(await r.json(),{ignored:true});}assert.equal(s.calls.length,0);});
test('checkout requires team permission and sends GST invoice and ABN collection',async()=>{
 const denied=setup({canSponsor:false});assert.equal((await denied.handler(new Request('https://fn/billing/checkout',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify({jobId:job})}))).status,403);assert.equal(denied.calls.length,0);
 const s=setup();const r=await s.handler(new Request('https://fn/billing/checkout',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify({jobId:job})}));
 assert.deepEqual(await r.json(),{url:'https://checkout.stripe.com/c/1'});
 const form=s.calls[0][2];assert.equal(form['line_items[0][price]'],'price_1');assert.equal(form['invoice_creation[enabled]'],'true');assert.equal(form['tax_id_collection[enabled]'],'true');assert.equal(form['metadata[job_id]'],job);assert.equal(form['metadata[user_id]'],'u1');
});
test('checkout is unavailable until Stripe is configured',async()=>{const s=setup({env:{STRIPE_SECRET_KEY:undefined}});assert.equal((await s.handler(new Request('https://fn/billing/checkout',{method:'POST'}))).status,503);});
test('a paid checkout stores the hosted invoice link',async()=>{const s=setup();const send=async u=>{s.calls.push(['stripe-get',u]);return Response.json({hosted_invoice_url:'https://invoice.stripe.com/i/abc'});};
 const h=makeBillingHandler((_u,key)=>key==='service'?{rpc:async(n,a)=>{s.calls.push([n,a]);return {data:true,error:null};}}:{},n=>({SUPABASE_SERVICE_ROLE_KEY:'service',STRIPE_WEBHOOK_SECRET:'whsec',STRIPE_SECRET_KEY:'sk'})[n],send);
 const raw=event({invoice:'in_123'});const r=await h(hook(raw,sign(raw)));assert.equal(r.status,200);
 assert.deepEqual(s.calls.map(c=>c[0]),['jp_record_sponsorship','stripe-get','jp_set_sponsorship_invoice']);assert.deepEqual(s.calls[2][1],{session:'cs_1',url:'https://invoice.stripe.com/i/abc'});});
