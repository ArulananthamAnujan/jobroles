import test from 'node:test';
import assert from 'node:assert/strict';
import {enabledProviders,forgetProviders} from '../lib/backend/providers.ts';
const reply=(external:Record<string,boolean>)=>(async()=>Response.json({external})) as unknown as typeof fetch;
test('sign-in buttons follow what is switched on in Supabase',async()=>{
 delete process.env.AUTH_PROVIDERS;delete process.env.NEXT_PUBLIC_AUTH_PROVIDERS;
 process.env.SUPABASE_URL='https://x.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='k';
 forgetProviders();
 assert.deepEqual(await enabledProviders(reply({email:true,google:true,apple:false,github:true,linkedin_oidc:true})),['google','linkedin_oidc']);
 // The answer is kept for five minutes, then asked for again.
 assert.deepEqual(await enabledProviders(reply({google:false}),Date.now()+60_000),['google','linkedin_oidc']);
 assert.deepEqual(await enabledProviders(reply({google:false}),Date.now()+6*60_000),[]);
});
test('a failed lookup keeps the last answer, and a setting on the host overrides Supabase',async()=>{
 forgetProviders();
 const down=(async()=>{throw new Error('offline');}) as unknown as typeof fetch;
 assert.deepEqual(await enabledProviders(down),[]);
 assert.deepEqual(await enabledProviders(reply({google:true})),['google']);
 assert.deepEqual(await enabledProviders(down,Date.now()+6*60_000),['google']);
 process.env.AUTH_PROVIDERS='apple, something-else';assert.deepEqual(await enabledProviders(reply({google:true})),['apple']);
 process.env.AUTH_PROVIDERS='none';assert.deepEqual(await enabledProviders(reply({google:true})),[]);
 delete process.env.AUTH_PROVIDERS;
});
