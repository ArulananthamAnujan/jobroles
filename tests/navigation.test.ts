import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountView,accountHref,resultsHref} from '../lib/navigation.ts';
test('profile tab retains application context without being forced back to jobs',()=>{
 const href=accountHref('profile','job=abc');assert.equal(href,'/account?view=profile&job=abc');assert.equal(accountView(href.split('?')[1],''),'profile');
 assert.equal(accountView('job=abc',''),'jobs');
});
test('application deep links still open drafts and hashes select their sections',()=>{
 assert.equal(accountView('job=abc','#application'),'jobs');
 assert.equal(accountView('view=overview','#applications'),'applications');
 assert.equal(accountView('view=invalid',''),'overview');
});
test('back to results preserves search filters and pagination but excludes unrelated params',()=>{
 assert.equal(resultsHref('q=Nurse&location=Melbourne&page=3&token_hash=secret&view=hiring'),'/search?q=Nurse&location=Melbourne&page=3');
 assert.equal(resultsHref(''),'/search');
});

test('application preference navigation is recognised',()=>{assert.equal(accountView('view=preferences',''),'preferences');});
