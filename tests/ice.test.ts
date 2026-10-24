import test from 'node:test';
import assert from 'node:assert/strict';
import {iceServers} from '../lib/ice.ts';
test('STUN only when no relay is configured',async()=>{const s=await iceServers({},async()=>{throw Error('no network');});assert.equal(s.length,1);});
test('Cloudflare TURN credentials are fetched and added',async()=>{let url='';
 const s=await iceServers({CLOUDFLARE_TURN_KEY_ID:'k1',CLOUDFLARE_TURN_API_TOKEN:'t'},(async(u:string)=>{url=u;return Response.json({iceServers:[{urls:['stun:stun.cloudflare.com:3478']},{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:'u',credential:'c'}]});}) as unknown as typeof fetch);
 assert.match(url,/keys\/k1\/credentials/);assert.equal(s.length,2);assert.equal(s[1].username,'u');});
test('a failing relay API still leaves STUN, and a static TURN server is added',async()=>{
 const s=await iceServers({CLOUDFLARE_TURN_KEY_ID:'k',CLOUDFLARE_TURN_API_TOKEN:'t',TURN_URL:'turn:a.example:3478, turns:a.example:5349',TURN_USERNAME:'x',TURN_CREDENTIAL:'y'},(async()=>new Response('no',{status:500})) as unknown as typeof fetch);
 assert.equal(s.length,2);assert.deepEqual(s[1].urls,['turn:a.example:3478','turns:a.example:5349']);});
