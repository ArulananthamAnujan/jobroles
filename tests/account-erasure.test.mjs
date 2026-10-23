import test from 'node:test';
import assert from 'node:assert/strict';
import {makeErasureHandler} from '../supabase/functions/account-erasure/handler.js';
const target='00000000-0000-4000-8000-000000000002';
function setup({isAdmin=true,rpcError=null,user={id:'admin',email_confirmed_at:'x'}}={}){
 const calls=[];
 const client=(_url,key)=>key==='service'?{rpc:async(n,a)=>{calls.push(['rpc',n,a]);return rpcError?{data:null,error:rpcError}:{data:{storageKeys:['u/a.pdf']},error:null};},storage:{from:()=>({remove:async k=>{calls.push(['remove',k]);return {error:null};}})},auth:{admin:{deleteUser:async(id,soft)=>{calls.push(['deleteUser',id,soft]);return {error:null};}}}}
  :{auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:isAdmin,error:null})};
 return {handler:makeErasureHandler(client,n=>n==='SUPABASE_SERVICE_ROLE_KEY'?'service':'anon'),calls};
}
const req=(body={userId:target})=>new Request('https://x',{method:'POST',headers:{Authorization:'Bearer t'},body:JSON.stringify(body)});
test('non-administrators never reach the service role',async()=>{const s=setup({isAdmin:false});assert.equal((await s.handler(req())).status,403);assert.equal(s.calls.length,0);});
test('administrators cannot erase themselves',async()=>{const s=setup({user:{id:target,email_confirmed_at:'x'}});assert.equal((await s.handler(req())).status,400);assert.equal(s.calls.length,0);});
test('erasure removes files and soft-deletes the identity',async()=>{const s=setup();const r=await s.handler(req());assert.deepEqual(await r.json(),{erased:true,filesRemoved:true,identityRemoved:true});assert.deepEqual(s.calls,[['rpc','jp_erase_account',{target,reviewer:'admin'}],['remove',['u/a.pdf']],['deleteUser',target,true]]);});
test('without an open request nothing else happens',async()=>{const s=setup({rpcError:{code:'22023',message:'No open deletion request for this account'}});const r=await s.handler(req());assert.equal(r.status,409);assert.equal(s.calls.length,1);});
