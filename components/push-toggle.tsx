'use client';
import {useEffect,useState} from 'react';
// Lets a signed-in person receive job alerts as phone or browser notifications (needs NEXT_PUBLIC_VAPID_PUBLIC_KEY).
const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const toBytes=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
async function call(method:'POST'|'DELETE',body:unknown){const r=await fetch('/api/push',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(((await r.json()) as {error?:string}).error||'Please try again.');}
export default function PushToggle(){
 const [state,S]=useState<'unsupported'|'off'|'on'|'blocked'|'busy'>('busy'),[error,E]=useState('');
 useEffect(()=>{
  // Browser capabilities are only known after hydration; resolve them asynchronously.
  const supported=Boolean(key)&&'serviceWorker' in navigator&&'PushManager' in window;
  Promise.resolve().then(()=>{if(!supported)return 'unsupported' as const;if(Notification.permission==='denied')return 'blocked' as const;return navigator.serviceWorker.ready.then(r=>r.pushManager.getSubscription()).then(s=>s?'on' as const:'off' as const);}).then(S).catch(()=>S('off'));
 },[]);
 if(state==='unsupported')return null;
 async function enable(){S('busy');E('');try{if(await Notification.requestPermission()!=='granted'){S('blocked');return;}const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(key!)});await call('POST',sub.toJSON());S('on');}catch(e){E((e as Error).message);S('off');}}
 async function disable(){S('busy');E('');try{const sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription();if(sub){await call('DELETE',{endpoint:sub.endpoint});await sub.unsubscribe();}S('off');}catch(e){E((e as Error).message);S('on');}}
 return <div className="push-toggle"><p><strong>Notifications on this device</strong><br/>{state==='on'?'Job alerts also arrive as notifications here.':state==='blocked'?'Notifications are blocked in this browser’s settings.':'Get job alerts as notifications on this phone or computer.'}</p>
  {state!=='blocked'&&<button className="jp-btn secondary" disabled={state==='busy'} onClick={state==='on'?disable:enable}>{state==='on'?'Turn off':'Turn on notifications'}</button>}{error&&<p role="alert">{error}</p>}</div>;
}
