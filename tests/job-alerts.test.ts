import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeAlertWorker,alertEmail} from '../supabase/functions/job-alerts/handler.ts';
const claim={id:'s1',email:'sam@example.test',filters:{q:'RN',location:'Frankston'},since:'2026-10-20T00:00:00Z',checked_at:'2026-10-23T00:00:00Z',lease:'l1',token:'t'.repeat(64)};
const jobs=[{id:'new',title:'Registered Nurse <ED>',salary_min:92000,salary_max:108000,salary_period:'year',published_at:'2026-10-22T00:00:00Z',companies:{name:'Bayside'},job_locations:[{label:'Frankston VIC'}]},{id:'old',title:'Old role',salary_min:null,salary_max:null,salary_period:null,published_at:'2026-10-01T00:00:00Z',companies:{name:'Bayside'},job_locations:[{label:'Frankston VIC'}]}];
function setup(env:Record<string,string|undefined>={}){
 const calls:{rpc:[string,Record<string,unknown>][];mail:Record<string,unknown>[]}={rpc:[],mail:[]};
 const client=()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.rpc.push([name,args]);if(name==='jp_claim_job_alerts')return {data:[claim],error:null};if(name==='jp_search_jobs')return {data:[{job_id:'new'},{job_id:'old'}],error:null};return {data:true,error:null};},from:()=>({select:()=>({in:async()=>({data:jobs,error:null})})})});
 const send=(async(_u:string,init:RequestInit)=>{calls.mail.push(JSON.parse(String(init.body)));return Response.json({id:'m'});}) as typeof fetch;
 const values:Record<string,string|undefined>={JOB_ALERT_WORKER_SECRET:'s',JOB_ALERTS_ENABLED:'true',RESEND_API_KEY:'k',NOTIFICATION_FROM:'JobRoles <alerts@jobroles.example>',APP_ORIGIN:'https://jobroles.example',...env};
 return {worker:makeAlertWorker(client,n=>values[n],send),calls};
}
const call=(secret='s')=>new Request('https://x',{method:'POST',headers:{'x-job-alert-secret':secret}});
test('the alert worker requires its secret and configuration',async()=>{assert.equal((await setup().worker(call('no'))).status,401);assert.equal((await setup({JOB_ALERTS_ENABLED:undefined}).worker(call())).status,503);});
test('alerts send only roles posted in the window, expand synonyms, and finish the lease',async()=>{
 const s=setup();const r=await s.worker(call());assert.deepEqual(await r.json(),{sent:1,empty:0,failed:0,pushed:0,digests:0});
 const search=s.calls.rpc.find(([n])=>n==='jp_search_jobs')![1];assert.equal(search.p_query,'(rn | (registered <-> nurse))');assert.equal(search.p_query_mode,'tsquery');assert.equal(search.p_location,'Frankston');
 const mail=s.calls.mail[0] as {to:string[];text:string;html:string;headers:Record<string,string>};
 assert.deepEqual(mail.to,['sam@example.test']);assert.match(mail.text,/Registered Nurse <ED>/);assert.doesNotMatch(mail.text,/Old role/);
 assert.match(mail.html,/Registered Nurse &lt;ED&gt;/);assert.match(mail.headers['List-Unsubscribe'],/\/api\/alerts\/unsubscribe\?id=s1&token=t{64}/);
 assert.deepEqual(s.calls.rpc.find(([n])=>n==='jp_finish_job_alert'),['jp_finish_job_alert',{target:'s1',lease:'l1',checked:claim.checked_at}]);
});
test('the email names the sender and carries an unsubscribe link',()=>{const m=alertEmail(claim,[jobs[0]],'https://jobroles.example');assert.match(m.text,/Unsubscribe from this alert: https:\/\/jobroles.example\/alerts\/unsubscribe\?id=s1&token=/);assert.match(m.text,/JobRoles, an Australian job board/);assert.equal(m.subject,'1 new job for RN');});
test('the worker uses the same query builder as the website',async()=>{assert.equal(await readFile('supabase/functions/_shared/search.ts','utf8'),await readFile('lib/search.ts','utf8'));});
test('alerts are also pushed to the person’s devices, and dead subscriptions are removed',async()=>{
 const {generateKeyPairSync,createECDH}=await import('node:crypto');const {b64url}=await import('../supabase/functions/_shared/webpush.ts');
 const jwk=generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'}) as {d:string;x:string;y:string};
 const pub=b64url.encode(new Uint8Array([4,...b64url.decode(jwk.x),...b64url.decode(jwk.y)]));
 const ua=createECDH('prime256v1');ua.generateKeys();const key=b64url.encode(new Uint8Array(ua.getPublicKey())),auth=b64url.encode(new Uint8Array(16).fill(1));
 const subs=[{id:'p1',endpoint:'https://push.example/live',p256dh:key,auth},{id:'p2',endpoint:'https://push.example/gone',p256dh:key,auth}];
 const deleted:string[]=[],pushedTo:string[]=[];
 const client=()=>({rpc:async(n:string)=>n==='jp_claim_job_alerts'?{data:[{...claim,user_id:'u1'}],error:null}:n==='jp_search_jobs'?{data:[{job_id:'new'}],error:null}:{data:true,error:null},
  from:(t:string)=>t==='push_subscriptions'?{select:()=>({eq:async()=>({data:subs,error:null})}),delete:()=>({eq:async(_c:string,id:string)=>{deleted.push(id);return {error:null};}})}:{select:()=>({in:async()=>({data:jobs,error:null})})}});
 const send=(async(u:string,init:RequestInit)=>{if(u.startsWith('https://push.example')){pushedTo.push(u);assert.match(String((init.headers as Record<string,string>).Authorization),/^vapid t=/);return new Response(null,{status:u.endsWith('gone')?410:201});}return Response.json({id:'m'});}) as typeof fetch;
 const env:Record<string,string>={JOB_ALERT_WORKER_SECRET:'s',JOB_ALERTS_ENABLED:'true',RESEND_API_KEY:'k',NOTIFICATION_FROM:'a@b',APP_ORIGIN:'https://jobroles.example',VAPID_PUBLIC_KEY:pub,VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:'mailto:support@jobroles.example'};
 const r=await makeAlertWorker(client,n=>env[n],send)(call());
 assert.deepEqual(await r.json(),{sent:1,empty:0,failed:0,pushed:1,digests:0});assert.deepEqual(pushedTo,['https://push.example/live','https://push.example/gone']);assert.deepEqual(deleted,['p2']);
});
test('employers on a daily digest get one summary email',async()=>{
 const mails:Record<string,unknown>[]=[];
 const client=()=>({rpc:async(n:string)=>n==='jp_claim_employer_digests'?{data:[{email:'boss@bayside.example',jobs:[{jobId:'j1',title:'Registered Nurse',count:3},{jobId:'j2',title:'Chef',count:1}]}],error:null}:{data:[],error:null},from:()=>({select:()=>({in:async()=>({data:[],error:null})})})});
 const send=(async(_u:string,init:RequestInit)=>{mails.push(JSON.parse(String(init.body)));return Response.json({id:'m'});}) as typeof fetch;
 const env:Record<string,string>={JOB_ALERT_WORKER_SECRET:'s',JOB_ALERTS_ENABLED:'true',RESEND_API_KEY:'k',NOTIFICATION_FROM:'a@b',APP_ORIGIN:'https://jobroles.example'};
 const r=await makeAlertWorker(client,n=>env[n],send)(call());
 assert.deepEqual(await r.json(),{sent:0,empty:0,failed:0,pushed:0,digests:1});
 assert.equal(mails[0].subject,'4 new applicants on JobRoles');assert.match(String(mails[0].text),/Registered Nurse: 3 new applicants\nhttps:\/\/jobroles.example\/employer\?view=applicants&job=j1/);
});
