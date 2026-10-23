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
 const s=setup();const r=await s.worker(call());assert.deepEqual(await r.json(),{sent:1,empty:0,failed:0});
 const search=s.calls.rpc.find(([n])=>n==='jp_search_jobs')![1];assert.equal(search.p_query,'(rn | (registered <-> nurse))');assert.equal(search.p_query_mode,'tsquery');assert.equal(search.p_location,'Frankston');
 const mail=s.calls.mail[0] as {to:string[];text:string;html:string;headers:Record<string,string>};
 assert.deepEqual(mail.to,['sam@example.test']);assert.match(mail.text,/Registered Nurse <ED>/);assert.doesNotMatch(mail.text,/Old role/);
 assert.match(mail.html,/Registered Nurse &lt;ED&gt;/);assert.match(mail.headers['List-Unsubscribe'],/\/api\/alerts\/unsubscribe\?id=s1&token=t{64}/);
 assert.deepEqual(s.calls.rpc.at(-1),['jp_finish_job_alert',{target:'s1',lease:'l1',checked:claim.checked_at}]);
});
test('the email names the sender and carries an unsubscribe link',()=>{const m=alertEmail(claim,[jobs[0]],'https://jobroles.example');assert.match(m.text,/Unsubscribe from this alert: https:\/\/jobroles.example\/alerts\/unsubscribe\?id=s1&token=/);assert.match(m.text,/JobRoles, an Australian job board/);assert.equal(m.subject,'1 new job for RN');});
test('the worker uses the same query builder as the website',async()=>{assert.equal(await readFile('supabase/functions/_shared/search.ts','utf8'),await readFile('lib/search.ts','utf8'));});
