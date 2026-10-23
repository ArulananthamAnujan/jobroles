'use client';
// Small fetch helpers for the employer portal. Errors carry the server's message for display.
export async function get<T>(path:string,signal?:AbortSignal):Promise<T>{const r=await fetch(path,{signal,cache:'no-store'});const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'Something went wrong. Please try again.');return d;}
export async function post<T=unknown>(path:string,body:unknown,method='POST'):Promise<T>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'The change could not be saved.');return d;}
export const employerGet=<T,>(resource:string,params:Record<string,string>,signal?:AbortSignal)=>get<T>(`/api/employer?${new URLSearchParams({resource,...params})}`,signal);
export const employerPost=<T=unknown,>(body:Record<string,unknown>)=>post<T>('/api/employer',body);
export const command=(action:string,payload:unknown)=>post('/api/command',{action,payload});
export const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);
export const when=(iso:string,opts:Intl.DateTimeFormatOptions={day:'numeric',month:'short',year:'numeric'})=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',...opts}).format(new Date(iso));
export const ago=(iso:string)=>{const m=Math.round((Date.now()-new Date(iso).getTime())/60000);return m<1?'just now':m<60?`${m} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`;};
export const STAGES=[['new','New'],['reviewed','Reviewed'],['shortlisted','Shortlisted'],['interview','Interview'],['offer','Offer'],['hired','Hired'],['rejected','Not progressing']] as const;
export const stageLabel=(s:string)=>STAGES.find(([k])=>k===s)?.[1]??s;
