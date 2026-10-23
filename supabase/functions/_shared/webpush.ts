// Web Push without dependencies: RFC 8291 (aes128gcm payload encryption) and RFC 8292 (VAPID), on WebCrypto.
export type PushSubscription={endpoint:string;p256dh:string;auth:string};
const te=new TextEncoder();
export const b64url={
 encode:(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
 decode:(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0)),
};
const concat=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;};
async function hkdf(salt:Uint8Array,ikm:Uint8Array,info:Uint8Array,bytes:number){const key=await crypto.subtle.importKey('raw',ikm as BufferSource,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:salt as BufferSource,info:info as BufferSource},key,bytes*8));}
export async function encryptPayload(sub:PushSubscription,payload:Uint8Array,salt=crypto.getRandomValues(new Uint8Array(16))){
 const uaPublic=b64url.decode(sub.p256dh),authSecret=b64url.decode(sub.auth);
 const local=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
 const asPublic=new Uint8Array(await crypto.subtle.exportKey('raw',local.publicKey));
 const peer=await crypto.subtle.importKey('raw',uaPublic as BufferSource,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:peer},local.privateKey,256));
 const ikm=await hkdf(authSecret,shared,concat(te.encode('WebPush: info\0'),uaPublic,asPublic),32);
 const cek=await hkdf(salt,ikm,te.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(salt,ikm,te.encode('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',cek as BufferSource,'AES-GCM',false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce as BufferSource},key,concat(payload,new Uint8Array([2])) as BufferSource));
 const header=new Uint8Array(21);header.set(salt,0);new DataView(header.buffer).setUint32(16,4096);header[20]=65;
 return concat(header,asPublic,cipher);
}
// VAPID keys are base64url: the public key is the 65-byte uncompressed point, the private key the 32-byte scalar.
export async function vapidAuthorization(endpoint:string,publicKey:string,privateKey:string,subject:string,now=Math.floor(Date.now()/1000)){
 const pub=b64url.decode(publicKey);
 const jwk={kty:'EC',crv:'P-256',d:privateKey,x:b64url.encode(pub.slice(1,33)),y:b64url.encode(pub.slice(33,65)),ext:true};
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const part=(o:object)=>b64url.encode(te.encode(JSON.stringify(o)));
 const unsigned=`${part({typ:'JWT',alg:'ES256'})}.${part({aud:new URL(endpoint).origin,exp:now+12*3600,sub:subject})}`;
 const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,te.encode(unsigned)));
 return `vapid t=${unsigned}.${b64url.encode(sig)}, k=${publicKey}`;
}
// Returns the push service status. 404 and 410 mean the subscription is gone and should be deleted.
export async function sendPush(sub:PushSubscription,message:object,vapid:{publicKey:string;privateKey:string;subject:string},send:typeof fetch=fetch){
 const body=await encryptPayload(sub,te.encode(JSON.stringify(message)));
 const res=await send(sub.endpoint,{method:'POST',headers:{'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'86400',Urgency:'normal',Authorization:await vapidAuthorization(sub.endpoint,vapid.publicKey,vapid.privateKey,vapid.subject)},body:body as BodyInit,signal:AbortSignal.timeout(10000)});
 return res.status;
}
