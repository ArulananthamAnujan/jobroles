import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler} from '../supabase/functions/resume-download/handler.js';
const id='00000000-0000-4000-8000-000000000001';
function setup({user={email_confirmed_at:'2026-01-01'},resume={storage_key:'private/key',filename:'resume.pdf',mime_type:'application/pdf'},authError=null}={}){
 let privileged=0;
 const client=(url,key)=>{if(key==='service'){privileged++;return {storage:{from:()=>({download:async()=>({data:new Blob(['document']),error:null})})}};}
 const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:resume,error:null})};
 return {auth:{getUser:async()=>({data:{user},error:authError})},from:()=>query};};
 return {handler:makeHandler(client,name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'service':'user'),privileged:()=>privileged};
}
const request=(body={id},auth=true)=>new Request('https://example.test',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify(body)});
test('download rejects anonymous requests before touching privileged storage',async()=>{const s=setup();assert.equal((await s.handler(request({},false))).status,401);assert.equal(s.privileged(),0);});
test('download revalidates user identity',async()=>{const s=setup({user:null,authError:{message:'expired'}});assert.equal((await s.handler(request())).status,401);assert.equal(s.privileged(),0);});
test('unconfirmed accounts cannot download',async()=>{const s=setup({user:{email_confirmed_at:null}});assert.equal((await s.handler(request())).status,401);assert.equal(s.privileged(),0);});
test('RLS denial never falls back to privileged metadata',async()=>{const s=setup({resume:null});assert.equal((await s.handler(request())).status,404);assert.equal(s.privileged(),0);});
test('malformed IDs rejected before privileged read',async()=>{const s=setup();assert.equal((await s.handler(request({id:'other/file'}))).status,404);assert.equal(s.privileged(),0);});
test('authorized download is attachment and never cacheable',async()=>{const s=setup();const r=await s.handler(request());assert.equal(r.status,200);assert.equal(s.privileged(),1);assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(await r.text(),'document');});
