import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAdClickHandler} from '../supabase/functions/ad-click/handler.js';
const job='00000000-0000-4000-8000-000000000011',visitor='a'.repeat(64);
function setup(secret='s3cret'){const calls=[];const env={AD_CLICK_SECRET:secret,SUPABASE_URL:'u',SUPABASE_SERVICE_ROLE_KEY:'k'};
 return {calls,handler:makeAdClickHandler(()=>({rpc:async(n,a)=>{calls.push([n,a]);return {data:{charged:true,cost:150},error:null};}}),n=>env[n])};}
const req=(body,secret='s3cret')=>new Request('https://fn/ad-click',{method:'POST',headers:{'x-worker-secret':secret},body:JSON.stringify(body)});
test('only the web server with the shared secret can record a click',async()=>{
 const s=setup();assert.equal((await s.handler(req({jobId:job,visitor},'wrong'))).status,401);
 assert.equal((await setup('').handler(req({jobId:job,visitor},''))).status,401);assert.equal(s.calls.length,0);
});
test('a valid click is passed to the database once',async()=>{
 const s=setup();assert.equal((await s.handler(req({jobId:'nope',visitor}))).status,400);assert.equal((await s.handler(req({jobId:job,visitor:'short'}))).status,400);
 const r=await s.handler(req({jobId:job,visitor}));assert.deepEqual(await r.json(),{charged:true,cost:150});assert.deepEqual(s.calls,[['jp_record_sponsored_click',{target:job,visitor_key:visitor,network_key:null}]]);
});
