'use client';
import {useEffect,useRef,useState} from 'react';
// Cloudflare Turnstile, shown only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. The token lands in a hidden
// "captcha" field of the surrounding form; call resetCaptcha() after each submit because tokens are single-use.
type Turnstile={render:(el:HTMLElement,opts:Record<string,unknown>)=>string;reset:(id?:string)=>void;remove:(id:string)=>void};
declare global{interface Window{turnstile?:Turnstile}}
const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
let loading:Promise<void>|null=null;
function load(){return loading??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=()=>resolve();s.onerror=()=>{loading=null;reject(new Error('Security check failed to load.'));};document.head.appendChild(s);});}
export function resetCaptcha(){window.turnstile?.reset();}
export default function Captcha(){
 const box=useRef<HTMLDivElement>(null),[token,T]=useState(''),[error,E]=useState('');
 useEffect(()=>{if(!siteKey)return;let id:string|undefined,live=true;load().then(()=>{if(live&&box.current&&window.turnstile)id=window.turnstile.render(box.current,{sitekey:siteKey,callback:(t:string)=>T(t),'expired-callback':()=>T(''),'error-callback':()=>T('')});}).catch(e=>E((e as Error).message));return()=>{live=false;if(id)window.turnstile?.remove(id);};},[]);
 if(!siteKey)return null;
 return <div className="captcha"><div ref={box}/><input type="hidden" name="captcha" value={token}/>{error&&<p role="alert">{error}</p>}</div>;
}
