import {ApiError} from './server';
// Fixed-window limiter kept in this server instance's memory. It blunts bursts from one address;
// pair it with Supabase Auth's own limits and edge rules for anything distributed.
const windows=new Map<string,{start:number;count:number}>();
export function rateLimit(key:string,limit:number,windowMs:number,now=Date.now()){
 const w=windows.get(key);
 if(!w||now-w.start>=windowMs){windows.set(key,{start:now,count:1});if(windows.size>10000)prune(now,windowMs);return;}
 if(++w.count>limit)throw new ApiError(429,'Too many requests. Please wait a minute and try again.');
}
function prune(now:number,windowMs:number){for(const [k,w] of windows)if(now-w.start>=windowMs)windows.delete(k);}
export function resetRateLimits(){windows.clear();}
export function clientIp(request:Request){
 return request.headers.get('x-nf-client-connection-ip')||request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
}
// Cloudflare Turnstile. When TURNSTILE_SECRET_KEY is unset the check is skipped, so local work needs no keys.
export async function verifyCaptcha(token:unknown,ip:string,send:typeof fetch=fetch){
 const secret=process.env.TURNSTILE_SECRET_KEY;if(!secret)return;
 if(typeof token!=='string'||!token||token.length>2048)throw new ApiError(400,'Complete the security check and try again.');
 let ok=false;
 try{const r=await send('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret,response:token,remoteip:ip}),signal:AbortSignal.timeout(8000)});ok=Boolean(((await r.json()) as {success?:boolean}).success);}catch{throw new ApiError(503,'The security check is unavailable. Please try again shortly.');}
 if(!ok)throw new ApiError(400,'The security check failed. Please try again.');
}
// Links in emails and the same-origin check depend on the canonical origin; production refuses to guess it.
export function appOrigin(){
 const origin=process.env.APP_ORIGIN;
 if(!origin){if(process.env.NODE_ENV==='production')throw new ApiError(503,'This site is not fully configured. Please contact support.');return 'http://localhost:3000';}
 return origin.replace(/\/$/,'');
}
