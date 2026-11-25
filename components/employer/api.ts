'use client';
// Small fetch helpers for the employer portal. Errors carry the server's message for display.
// Two parts of a page that ask for the same thing at the same moment share one request. Nothing is remembered once
// an answer has arrived: every later read goes to the server, so a list can never show data from before a change.
// (An earlier version remembered answers for 30 seconds to speed up screen changes; it could show a stale list after
// a save, which is worse than a short wait.)
const inFlight=new Map<string,Promise<unknown>>();
// Kept so screens can call it after a save; it drops any request still on its way, so its answer is not reused.
export function forgetAnswers(){inFlight.clear();}
async function ask(path:string):Promise<unknown>{const r=await fetch(path,{cache:'no-store'});const d=await r.json().catch(()=>({})) as {error?:string};if(!r.ok)throw new Error(d.error||'Something went wrong. Please try again.');return d;}
export async function get<T>(path:string,signal?:AbortSignal):Promise<T>{
 let answer=inFlight.get(path);
 if(!answer){const mine:Promise<unknown>=ask(path).finally(()=>{if(inFlight.get(path)===mine)inFlight.delete(path);});answer=mine;inFlight.set(path,mine);}
 const data=await answer;if(signal?.aborted)throw new DOMException('Aborted','AbortError');return data as T;
}
export async function post<T=unknown>(path:string,body:unknown,method='POST'):Promise<T>{forgetAnswers();const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).finally(forgetAnswers);const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'The change could not be saved.');return d;}
export const employerGet=<T,>(resource:string,params:Record<string,string>,signal?:AbortSignal)=>get<T>(`/api/employer?${new URLSearchParams({resource,...params})}`,signal);
export const employerPost=<T=unknown,>(body:Record<string,unknown>)=>post<T>('/api/employer',body);
export const command=(action:string,payload:unknown)=>post('/api/command',{action,payload});
export const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);
export const when=(iso:string,opts:Intl.DateTimeFormatOptions={day:'numeric',month:'short',year:'numeric'})=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',...opts}).format(new Date(iso));
export const ago=(iso:string)=>{const m=Math.round((Date.now()-new Date(iso).getTime())/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;};
export const STAGES=[['new','New'],['reviewed','Reviewed'],['shortlisted','Shortlisted'],['interview','Interview'],['offer','Offer'],['hired','Hired'],['rejected','Not progressing']] as const;
export const stageLabel=(s:string)=>STAGES.find(([k])=>k===s)?.[1]??s;
