import test from 'node:test';
import assert from 'node:assert/strict';
import {fromThisSite} from '../lib/backend/origin.ts';
const site='https://jobroles.example';
test('state-changing requests must come from this site, including from Firefox',()=>{
 assert.equal(fromThisSite(site,null,site),true);
 // Firefox with a no-referrer page sends "Origin: null"; the browser-set Sec-Fetch-Site header vouches for it.
 assert.equal(fromThisSite('null','same-origin',site),true);
 assert.equal(fromThisSite(null,'same-origin',site),true);
 for(const [origin,fetchSite] of [['https://evil.example',null],['https://evil.example','same-origin'],['null','cross-site'],['null','same-site'],['null',null],[null,null],[null,'none']] as [string|null,string|null][])
  assert.equal(fromThisSite(origin,fetchSite,site),false,`${origin} ${fetchSite}`);
});
