import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,createDecipheriv,hkdfSync,createVerify,generateKeyPairSync} from 'node:crypto';
import {encryptPayload,vapidAuthorization,b64url} from '../supabase/functions/_shared/webpush.ts';
// Decrypts as a browser would (RFC 8291), using Node's own crypto, to prove the sender is correct.
test('payloads decrypt with the subscriber keys',async()=>{
 const ua=createECDH('prime256v1');ua.generateKeys();const auth=new Uint8Array(16).fill(7);
 const sub={endpoint:'https://push.example/x',p256dh:b64url.encode(new Uint8Array(ua.getPublicKey())),auth:b64url.encode(auth)};
 const body=await encryptPayload(sub,new TextEncoder().encode('{"title":"3 new nurse jobs"}'));
 const salt=body.slice(0,16),idlen=body[20],asPublic=body.slice(21,21+idlen),cipher=body.slice(21+idlen);
 assert.equal(new DataView(body.buffer,body.byteOffset).getUint32(16),4096);
 const shared=ua.computeSecret(asPublic);
 const ikm=Buffer.from(hkdfSync('sha256',shared,auth,Buffer.concat([Buffer.from('WebPush: info\0'),ua.getPublicKey(),Buffer.from(asPublic)]),32));
 const cek=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16)),nonce=Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
 const d=createDecipheriv('aes-128-gcm',cek,nonce);d.setAuthTag(Buffer.from(cipher.slice(-16)));
 const plain=Buffer.concat([d.update(Buffer.from(cipher.slice(0,-16))),d.final()]);
 assert.equal(plain.at(-1),2);assert.equal(plain.subarray(0,-1).toString(),'{"title":"3 new nurse jobs"}');
});
test('VAPID tokens are ES256 signed for the push service origin',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
 const jwk=privateKey.export({format:'jwk'}) as {d:string;x:string;y:string};
 const pub=b64url.encode(new Uint8Array([4,...b64url.decode(jwk.x),...b64url.decode(jwk.y)]));
 const header=await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc',pub,jwk.d,'mailto:support@jobroles.example',1000);
 const [,token,k]=header.match(/^vapid t=([^,]+), k=(.+)$/)!;assert.equal(k,pub);
 const [h,p,s]=token.split('.');const claims=JSON.parse(Buffer.from(p,'base64url').toString());
 assert.deepEqual(claims,{aud:'https://fcm.googleapis.com',exp:1000+43200,sub:'mailto:support@jobroles.example'});
 const v=createVerify('SHA256');v.update(`${h}.${p}`);assert.ok(v.verify({key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});
