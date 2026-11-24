import test from 'node:test';import assert from 'node:assert/strict';import {makeMailWorker} from '../supabase/functions/notification-mail/handler.js';
const settings={NOTIFICATION_WORKER_SECRET:'test-secret',NOTIFICATION_EMAIL_ENABLED:'true',RESEND_API_KEY:'test-key',NOTIFICATION_FROM:'JobRoles <updates@example.test>',APP_ORIGIN:'https://example.test'};
const request=()=>new Request('https://worker.test',{method:'POST',headers:{authorization:'Bearer test-scheduler-jwt','x-notification-worker-secret':'test-secret'}});
test('worker rejects anonymous requests without touching queue',async()=>{const h=makeMailWorker(()=>{throw Error('must not run')},k=>settings[k]);assert.equal((await h(new Request('https://worker.test',{method:'POST'}))).status,401);});
test('disabled delivery never dequeues or sends',async()=>{const h=makeMailWorker(()=>{throw Error('must not run')},k=>k==='NOTIFICATION_EMAIL_ENABLED'?'false':settings[k]);assert.equal((await h(request())).status,503);});
test('provider acceptance records stable idempotency and excludes message contents',async()=>{let sent,finish;const h=makeMailWorker(()=>({rpc:async(name,args)=>{if(name==='jp_claim_notification_mail')return {data:[{id:'one',application_id:'app',recipient_email:'reader@example.test',lease_token:'lease',body:'Private body'}]};if(name==='jp_claim_invitation_mail')return {data:[]};finish=args;return {data:true};}}),k=>settings[k],async(url,options)=>{sent=options;return Response.json({id:'provider-id'});});assert.equal((await h(request())).status,200);assert.equal(sent.headers['Idempotency-Key'],'jobroles-one');assert.equal(sent.body.includes('Private body'),false);assert.equal(finish.accepted,true);});
test('provider errors are queued for retry, never marked accepted',async()=>{let finish;const h=makeMailWorker(()=>({rpc:async(name,args)=>name==='jp_claim_notification_mail'?{data:[{id:'one',application_id:'app',recipient_email:'reader@example.test',lease_token:'lease'}]}:name==='jp_claim_invitation_mail'?{data:[]}:(finish=args,{data:true})}),k=>settings[k],async()=>Response.json({error:'unavailable'},{status:503}));await h(request());assert.equal(finish.accepted,false);});
test('emails name the job and the event without private content',async()=>{const {notificationEmail}=await import('../supabase/functions/notification-mail/handler.js');
 const seeker=notificationEmail({event_type:'message.send',application_id:'a1'},{seeker:true,title:'Registered Nurse',company:'Bayside Health'},'https://jobroles.example');
 assert.equal(seeker.subject,'Bayside Health sent you a message');assert.ok(seeker.text.includes('https://jobroles.example/account/applications/a1'));
 assert.equal(notificationEmail({event_type:'application.submitted',application_id:'a1'},{seeker:false,title:'Registered Nurse',company:'Bayside Health'},'https://x').subject,'New applicant for Registered Nurse');
 assert.equal(notificationEmail({event_type:'application.move',application_id:'a1'},null,'https://x').subject,'Update on an application');
});

const invite={id:'m1',lease_token:'lease-1',email:'new.person@example.test',company:'Bayside Health',role:'recruiter',inviter:'Ravi Kumar',token:'a'.repeat(64),expires_at:'2026-12-01T03:00:00Z'};
const inviteClient=(calls,rows=[invite])=>()=>({rpc:async(name,args)=>{calls.push([name,args]);return name==='jp_claim_notification_mail'?{data:[]}:name==='jp_claim_invitation_mail'?{data:rows}:{data:true};}});
test('a team invitation is emailed to the invited address with the company, the role and the link',async()=>{
 const calls=[];let sent;const h=makeMailWorker(inviteClient(calls),k=>settings[k],async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return Response.json({id:'re_123'});});
 const res=await h(request());assert.deepEqual(await res.json(),{accepted:0,failed:0,invited:1,invitesFailed:0});
 assert.equal(sent.url,'https://api.resend.com/emails');assert.deepEqual(sent.body.to,['new.person@example.test']);
 assert.equal(sent.body.subject,'Bayside Health invited you to their hiring team on JobRoles');
 assert.ok(sent.body.text.includes('Ravi Kumar from Bayside Health has invited you to join Bayside Health\'s hiring team on JobRoles as a recruiter.'));
 assert.ok(sent.body.text.includes(`https://example.test/account/invite#${'a'.repeat(64)}`));assert.ok(sent.body.text.includes('for new.person@example.test only'));
 assert.ok(sent.body.text.includes("If you don't have a JobRoles account yet, the page will help you create one first."));
 assert.ok(sent.body.html.includes(`href="https://example.test/account/invite#${'a'.repeat(64)}"`));
 assert.deepEqual(calls.at(-1),['jp_finish_invitation_mail',{mail_id:'m1',lease:'lease-1',accepted:true,problem:null}]);
});
test('an invitation the mail provider refuses is left to be retried, with the reason',async()=>{
 const calls=[];const h=makeMailWorker(inviteClient(calls),k=>settings[k],async()=>Response.json({message:'Domain is not verified'},{status:403}));
 assert.deepEqual(await (await h(request())).json(),{accepted:0,failed:0,invited:0,invitesFailed:1});
 assert.deepEqual(calls.at(-1),['jp_finish_invitation_mail',{mail_id:'m1',lease:'lease-1',accepted:false,problem:'Mail provider answered 403: Domain is not verified'}]);
});
test('company and inviter names cannot inject markup or extra lines into the invitation',async()=>{
 const {invitationEmail}=await import('../supabase/functions/notification-mail/handler.js');
 const m=invitationEmail({...invite,company:'Evil <img src=x>\nBcc: x@y.z',inviter:''},'https://example.test');
 assert.ok(!m.subject.includes('\n'));assert.ok(!m.html.includes('<img'));assert.ok(m.html.includes('Evil &lt;img src=x&gt; Bcc: x@y.z'));
 assert.ok(m.text.startsWith('Evil <img src=x> Bcc: x@y.z has invited you'));
});
test('an older database without the invitation queue does not stop other emails',async()=>{
 const h=makeMailWorker(()=>({rpc:async name=>name==='jp_claim_notification_mail'?{data:[]}:{data:null,error:{code:'PGRST202'}}}),k=>settings[k],async()=>{throw Error('nothing to send');});
 const res=await h(request());assert.equal(res.status,200);assert.deepEqual(await res.json(),{accepted:0,failed:0,invited:0,invitesFailed:0});
});
