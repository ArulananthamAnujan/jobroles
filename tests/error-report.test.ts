import test from 'node:test';
import assert from 'node:assert/strict';
import {scrub,sentryEnvelope} from '../lib/error-report.ts';
test('reports strip email addresses and tokens',()=>{assert.equal(scrub('failed for sam@home.test with eyJhbGciOi.eyJzdWIi.abc123 key abcdefghijklmnopqrstuvwxyz0123456789XY'),'failed for [email] with [token] key [token]');});
test('Sentry envelopes target the project from the DSN',()=>{
 const {url,payload}=sentryEnvelope('https://pubkey@o42.ingest.sentry.io/1234',{message:'boom',source:'api',path:'/api/jobs'},new Date('2026-10-24T00:00:00Z'));
 assert.equal(url,'https://o42.ingest.sentry.io/api/1234/envelope/?sentry_key=pubkey&sentry_version=7');
 const [head,type,event]=payload.split('\n').map(l=>JSON.parse(l));
 assert.equal(head.dsn,'https://pubkey@o42.ingest.sentry.io/1234');assert.deepEqual(type,{type:'event'});assert.equal(event.exception.values[0].value,'boom');assert.equal(event.transaction,'/api/jobs');
});
test('a reported message is logged on one line, so it cannot forge log entries',async()=>{
 const {reportError}=await import('../lib/error-report.ts');
 const seen:string[]=[],original=console.error;console.error=(...a:unknown[])=>{seen.push(a.join(' '));};
 try{await reportError(new Error('boom\n[api] /admin forged entry\r\nsecond'),{source:'client',path:'/search\n[api] fake'});}finally{console.error=original;}
 assert.equal(seen.length,1);assert.ok(!/[\r\n]/.test(seen[0]));
});
