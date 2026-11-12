'use client';
// Small fetch helpers for the employer portal. Errors carry the server's message for display.
// Answers are remembered for half a minute so moving between screens does not wait on the server again, and two
// parts of a page asking for the same thing share one request. Anything that saves a change empties the memory,
// so people always see their own changes straight away.
const FRESH_MS=30000,remembered=new Map<string,{at:number;data:unknown}>(),inFlight=new Map<string,Promise<unknown>>();
export function forgetAnswers(){remembered.clear();inFlight.clear();}
if(typeof window!=='undefined'&&!(window as unknown as {__jrFetch?:boolean}).__jrFetch){
 (window as unknown as {__jrFetch?:boolean}).__jrFetch=true;const real=window.fetch.bind(window);
 window.fetch=(input,init)=>{const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(method==='GET'||method==='HEAD')return real(input,init);forgetAnswers();
  // Signing in or out changes who the header should show.
  if(String(input instanceof Request?input.url:input).includes('/api/account')){try{sessionStorage.removeItem('jr.signedInAs');}catch{}}
  return real(input,init).finally(forgetAnswers);};
}
async function ask(path:string):Promise<unknown>{const r=await fetch(path,{cache:'no-store'});const d=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw new Error(d.error||'Something went wrong. Please try again.');return d;}
export async function get<T>(path:string,signal?:AbortSignal):Promise<T>{
 const hit=remembered.get(path);let answer:Promise<unknown>;
 if(hit&&Date.now()-hit.at<FRESH_MS)answer=Promise.resolve(hit.data);
 else{answer=inFlight.get(path)||ask(path).then(d=>{if(inFlight.get(path)===answer)remembered.set(path,{at:Date.now(),data:d});return d;}).finally(()=>{if(inFlight.get(path)===answer)inFlight.delete(path);});inFlight.set(path,answer);}
 const data=await answer;if(signal?.aborted)throw new DOMException('Aborted','AbortError');return data as T;
}
export async function post<T=unknown>(path:string,body:unknown,method='POST'):Promise<T>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'The change could not be saved.');return d;}
export const employerGet=<T,>(resource:string,params:Record<string,string>,signal?:AbortSignal)=>get<T>(`/api/employer?${new URLSearchParams({resource,...params})}`,signal);
export const employerPost=<T=unknown,>(body:Record<string,unknown>)=>post<T>('/api/employer',body);
export const command=(action:string,payload:unknown)=>post('/api/command',{action,payload});
export const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);
export const when=(iso:string,opts:Intl.DateTimeFormatOptions={day:'numeric',month:'short',year:'numeric'})=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',...opts}).format(new Date(iso));
export const ago=(iso:string)=>{const m=Math.round((Date.now()-new Date(iso).getTime())/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;};
export const STAGES=[['new','New'],['reviewed','Reviewed'],['shortlisted','Shortlisted'],['interview','Interview'],['offer','Offer'],['hired','Hired'],['rejected','Not progressing']] as const;
export const stageLabel=(s:string)=>STAGES.find(([k])=>k===s)?.[1]??s;
