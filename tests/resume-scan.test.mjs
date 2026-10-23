import test from 'node:test';
import assert from 'node:assert/strict';
import {makeScanWorker} from '../supabase/functions/resume-scan/handler.js';
function setup({pending=[{id:'a',storage_key:'u/a.pdf'},{id:'b',storage_key:'u/b.pdf'}],verdicts={'u/a.pdf':true,'u/b.pdf':false},env={}}={}){
 const recorded=[];
 const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:pending,error:null})};
 const client=()=>({from:()=>query,rpc:async(_,args)=>{recorded.push([args.target,args.result]);return {error:null};},storage:{from:()=>({download:async key=>({data:new Blob([key]),error:null})})}});
 const send=async(_url,init)=>{const key=await init.body.text();return Response.json({clean:verdicts[key]});};
 const values={RESUME_SCAN_WORKER_SECRET:'s',RESUME_SCANNER_URL:'https://scanner.test',...env};
 return {worker:makeScanWorker(client,n=>values[n],send),recorded};
}
const call=(secret='s')=>new Request('https://x.test',{method:'POST',headers:{'x-resume-scan-secret':secret}});
test('scan worker requires its secret',async()=>{const s=setup();assert.equal((await s.worker(call('wrong'))).status,401);assert.equal(s.recorded.length,0);});
test('scan worker refuses to run without a scanner',async()=>{const s=setup({env:{RESUME_SCANNER_URL:undefined}});assert.equal((await s.worker(call())).status,503);});
test('scan worker records each verdict',async()=>{const s=setup();const r=await s.worker(call());assert.deepEqual(await r.json(),{clean:1,infected:1,failed:0});assert.deepEqual(s.recorded,[['a','clean'],['b','infected']]);});
test('a scanner error leaves the file pending',async()=>{const s=setup({verdicts:{'u/a.pdf':'maybe','u/b.pdf':true}});const r=await s.worker(call());assert.deepEqual(await r.json(),{clean:1,infected:0,failed:1});assert.deepEqual(s.recorded,[['b','clean']]);});
