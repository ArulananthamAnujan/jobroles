import test from 'node:test';
import assert from 'node:assert/strict';
import {twinRedirect} from '../lib/twin-redirect.ts';
test('the www twin of the site address is sent to the proper address, keeping the page and its query',()=>{
 assert.equal(twinRedirect('www.jobroles.com.au','https://jobroles.com.au','/job-seeker?view=profile'),'https://jobroles.com.au/job-seeker?view=profile');
 assert.equal(twinRedirect('WWW.JobRoles.com.au:443','https://jobroles.com.au/','/'),'https://jobroles.com.au/');
 assert.equal(twinRedirect('jobroles.com.au','https://www.jobroles.com.au','/search?q=nurse'),'https://www.jobroles.com.au/search?q=nurse');
});
test('the proper address, other hosts and an unset site address are left alone',()=>{
 assert.equal(twinRedirect('jobroles.com.au','https://jobroles.com.au','/'),null);
 assert.equal(twinRedirect('localhost:3000','https://jobroles.com.au','/'),null);
 assert.equal(twinRedirect('evil.example','https://jobroles.com.au','/'),null);
 assert.equal(twinRedirect('www.jobroles.com.au',undefined,'/'),null);
 assert.equal(twinRedirect(null,'https://jobroles.com.au','/'),null);
 assert.equal(twinRedirect('www.jobroles.com.au','not a url','/'),null);
});
test('a path that tries to point somewhere else cannot change where the visitor is sent',()=>{
 assert.equal(twinRedirect('www.jobroles.com.au','https://jobroles.com.au','//evil.example/x'),'https://jobroles.com.au//evil.example/x');
 assert.equal(twinRedirect('www.jobroles.com.au','https://jobroles.com.au','evil.example'),'https://jobroles.com.au/');
});
