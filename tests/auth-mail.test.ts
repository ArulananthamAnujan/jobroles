import test from 'node:test';
import assert from 'node:assert/strict';
import {mailFailure,confirmationFields,confirmationDestination} from '../lib/auth-mail.ts';
test('mail service failures never produce a success result',()=>{assert.equal(mailFailure({status:500})?.status,503);assert.equal(mailFailure({code:'unexpected_failure'})?.status,503);});
test('mail limits have a retry explanation without exposing provider details',()=>{assert.equal(mailFailure({status:429})?.status,429);assert.equal(mailFailure({code:'over_email_send_rate_limit'})?.status,429);});
test('unknown account outcome stays generic',()=>{assert.equal(mailFailure({code:'user_not_found'}),null);assert.equal(mailFailure(null),null);});
test('confirmation accepts supported template variants and rejects arbitrary types',()=>{assert.ok(confirmationFields('token','signup'));assert.ok(confirmationFields('token','email'));assert.ok(confirmationFields('token','recovery'));assert.equal(confirmationFields('token','invite'),null);assert.equal(confirmationFields('', 'signup'),null);assert.equal(confirmationFields('x'.repeat(513),'signup'),null);});
test('confirmation redirects only to fixed local destinations',()=>{assert.equal(confirmationDestination('recovery'),'/account/reset');assert.equal(confirmationDestination('https://evil.test'),'/account?confirmed=1');});
