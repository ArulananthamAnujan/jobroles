// Team invitations are emailed, and the invitation page can preview them (migration 20261124000001_invitation_email).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDb,ids} from './harness.mjs';
const {owner,other,seeker,company}=ids;
const secret=n=>String(n).repeat(64).slice(0,64),hash=t=>createHash('sha256').update(t).digest('hex');
test('invitation emails',async t=>{
 const {rows,admin}=await createDb();
 const service=async(sql,params=[])=>{await admin('set role service_role');try{return await admin(sql,params);}finally{await admin('reset role');}};
 const invite=async(email,token,role='recruiter')=>(await rows(owner,'select jp_team_command($1,$2) as r',['invite',JSON.stringify({companyId:company,email,role,hash:hash(token)})]))[0].r.id;
 let id;
 await t.test('only the owner, holding the real link, can queue the email',async()=>{
  id=await invite('new.person@example.test',secret('a'));
  await assert.rejects(()=>rows(other,'select jp_queue_invitation_mail($1,$2)',[id,secret('a')]),/Owner required/);
  await assert.rejects(()=>rows(owner,'select jp_queue_invitation_mail($1,$2)',[id,secret('b')]),/invalid or expired/);
  assert.deepEqual((await rows(owner,'select jp_queue_invitation_mail($1,$2) as r',[id,secret('a')]))[0].r,{queued:true});
  assert.equal((await rows(owner,'select jp_invitation_mail_states($1) as r',[company]))[0].r[id],'sending');
  await assert.rejects(()=>rows(other,'select jp_invitation_mail_states($1)',[company]),/Owner required/);
 });
 await t.test('the link holder can see what the invitation is for before signing in; a wrong link shows nothing',async()=>{
  const p=(await rows(null,'select jp_invitation_preview($1) as r',[hash(secret('a'))]))[0].r;
  assert.deepEqual([p.state,p.company,p.role,p.email],['open','Bayside','recruiter','new.person@example.test']);
  assert.deepEqual((await rows(null,'select jp_invitation_preview($1) as r',[hash(secret('z'))]))[0].r,{state:'unknown'});
 });
 await t.test('the worker is handed the email with the company and the secret; other people cannot ask',async()=>{
  await assert.rejects(()=>rows(owner,'select * from jp_claim_invitation_mail()'),/permission denied/);
  await assert.rejects(()=>rows(null,'select * from jp_claim_invitation_mail()'),/permission denied/);
  const [m]=await service('select * from jp_claim_invitation_mail()');
  assert.deepEqual([m.email,m.company,m.role,m.token],['new.person@example.test','Bayside','recruiter',secret('a')]);
  assert.equal((await service('select * from jp_claim_invitation_mail()')).length,0,'not handed out twice while it is being sent');
  assert.equal((await service('select jp_finish_invitation_mail($1,$2,true,null) as ok',[m.id,m.lease_token]))[0].ok,true);
  assert.deepEqual((await admin('select state,token,sent_at is not null sent from private.invitation_mail where id=$1',[m.id]))[0],{state:'accepted',token:null,sent:true});
  assert.equal((await rows(owner,'select jp_invitation_mail_states($1) as r',[company]))[0].r[id],'sent');
 });
 await t.test('a refused email is retried, then given up on with the secret erased',async()=>{
  const again=await invite('second@example.test',secret('c'));await rows(owner,'select jp_queue_invitation_mail($1,$2)',[again,secret('c')]);
  for(let i=1;i<=5;i++){
   await admin("update private.invitation_mail set lease_until=now()-interval '1 second' where invitation_id=$1 and lease_until is not null",[again]);
   const [m]=await service('select * from jp_claim_invitation_mail()');assert.ok(m,`attempt ${i} is handed out`);
   await service("select jp_finish_invitation_mail($1,$2,false,'Mail provider answered 403')",[m.id,m.lease_token]);
  }
  assert.deepEqual((await admin('select state,token,last_error from private.invitation_mail where invitation_id=$1',[again]))[0],{state:'failed',token:null,last_error:'Mail provider answered 403'});
  assert.equal((await rows(owner,'select jp_invitation_mail_states($1) as r',[company]))[0].r[again],'failed');
 });
 await t.test('a cancelled invitation is never emailed, and its link says so',async()=>{
  const gone=await invite('third@example.test',secret('d'));await rows(owner,'select jp_queue_invitation_mail($1,$2)',[gone,secret('d')]);
  await admin('update company_invitations set revoked_at=now() where id=$1',[gone]);
  assert.equal((await service('select * from jp_claim_invitation_mail()')).length,0);
  assert.equal((await admin('select token from private.invitation_mail where invitation_id=$1',[gone]))[0].token,null);
  assert.equal((await rows(seeker,'select jp_invitation_preview($1) as r',[hash(secret('d'))]))[0].r.state,'cancelled');
 });
 await t.test('an email nobody has tried to send for three minutes shows as delayed, and administrators are told',async()=>{
  const late=await invite('late@example.test',secret('f'));await rows(owner,'select jp_queue_invitation_mail($1,$2)',[late,secret('f')]);
  assert.equal((await rows(owner,'select jp_invitation_mail_states($1) as r',[company]))[0].r[late],'sending');
  await admin("update private.invitation_mail set created_at=now()-interval '10 minutes' where invitation_id=$1",[late]);
  assert.equal((await rows(owner,'select jp_invitation_mail_states($1) as r',[company]))[0].r[late],'delayed');
  await admin('insert into private.platform_admins(user_id) values($1) on conflict do nothing',[ids.admin]);
  const h=(await rows(ids.admin,'select jp_invitation_mail_health() as r'))[0].r;
  assert.deepEqual([Number(h.neverTried),Number(h.waiting),Number(h.oldestMinutes)>=10,Number(h.sent),h.lastError],[1,1,true,1,'Mail provider answered 403']);
  await assert.rejects(()=>rows(owner,'select jp_invitation_mail_health()'),/Administrator required/);
  await admin('update company_invitations set revoked_at=now() where id=$1',[late]);
 });
 await t.test('at most 30 invitation emails a company a day',async()=>{
  await admin(`insert into private.invitation_mail(invitation_id,state) select id,'accepted' from (insert into company_invitations(company_id,email,role,token_hash) select $1,'bulk'||g||'@example.test','recruiter',md5(g::text)||md5(g::text) from generate_series(1,30) g returning id) x`,[company]).catch(async()=>{
   for(let g=1;g<=30;g++){const [r]=await admin("insert into company_invitations(company_id,email,role,token_hash) values($1,$2,'recruiter',$3) returning id",[company,`bulk${g}@example.test`,hash('bulk'+g)]);await admin("insert into private.invitation_mail(invitation_id,state) values($1,'accepted')",[r.id]);}});
  const over=await invite('toomany@example.test',secret('e'));
  await assert.rejects(()=>rows(owner,'select jp_queue_invitation_mail($1,$2)',[over,secret('e')]),/30 invitations today/);
 });
});
