'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Brand} from './market-ui';
import './video-room.css';
type Room={side:'candidate'|'employer';startsAt:string;timeZone:string;format:string;cancelled:boolean;opensAt:string;closesAt:string;applicationId:string;title:string};
type Signal={id:number;peer:string;side:'candidate'|'employer';kind:'hello'|'offer'|'answer'|'candidate'|'bye';payload:{to?:string;sdp?:string;type?:RTCSdpType;candidate?:RTCIceCandidateInit}};
async function call<T>(id:string,body?:object):Promise<T>{const r=await fetch(`/api/video/${id}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json().catch(()=>({})) as T&{error?:string};if(!r.ok)throw new Error(d.error||'The call could not connect.');return d;}
const time=(iso:string,zone:string)=>new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',hour:'numeric',minute:'2-digit',timeZone:zone}).format(new Date(iso));
// One-to-one interview call between the applicant and the hiring team. The employer side starts the connection
// whenever an applicant joins; setup messages go through JobRoles, audio and video go directly between browsers.
export default function VideoRoom({id}:{id:string}){
 const [room,R]=useState<Room|null>(null),[ice,I]=useState<RTCIceServer[]>([]),[error,E]=useState(''),[phase,P]=useState<'lobby'|'joined'|'left'>('lobby');
 const [local,L]=useState<MediaStream|null>(null),[remote,RM]=useState<MediaStream|null>(null),[mic,M]=useState(true),[cam,C]=useState(true),[sharing,SH]=useState(false),[status,ST]=useState(''),[trouble,TR]=useState(false),[audioOnly,AO]=useState(false);
 const peer=useRef(''),pc=useRef<RTCPeerConnection|null>(null),other=useRef(''),after=useRef(0),pending=useRef<RTCIceCandidateInit[]>([]),greeted=useRef(new Set<string>()),localRef=useRef<MediaStream|null>(null);
 const mine=useRef<HTMLVideoElement>(null),theirs=useRef<HTMLVideoElement>(null);
 useEffect(()=>{let live=true;call<{room:Room;iceServers:RTCIceServer[]}>(id).then(d=>{if(live){R(d.room);I(d.iceServers);}}).catch(e=>{if(live)E(e.message);});
  try{peer.current=crypto.randomUUID();}catch{peer.current=`p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;}
  return()=>{live=false;};},[id]);
 useEffect(()=>{if(mine.current)mine.current.srcObject=local;},[local,phase]);
 useEffect(()=>{if(theirs.current)theirs.current.srcObject=remote;},[remote]);
 const send=useCallback((kind:Signal['kind'],payload:object={})=>call(id,{action:'signal',peer:peer.current,kind,payload}),[id]);
 const startCamera=useCallback(async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:{width:{ideal:1280},height:{ideal:720}}});localRef.current=s;L(s);E('');}
  catch{E('We could not use your camera or microphone. Allow access in your browser settings, then try again.');}},[]);
 // Ask for the camera once the page loads, so people can check how they look before joining.
 useEffect(()=>{let live=true;Promise.resolve().then(()=>{if(live)void startCamera();});return()=>{live=false;localRef.current?.getTracks().forEach(t=>t.stop());};},[startCamera]);
 const connection=useCallback((to:string)=>{
  pc.current?.close();pending.current=[];other.current=to;RM(null);
  const c=new RTCPeerConnection({iceServers:ice});pc.current=c;
  localRef.current?.getTracks().forEach(t=>c.addTrack(t,localRef.current!));
  c.onicecandidate=e=>{if(e.candidate)void send('candidate',{to,candidate:e.candidate.toJSON()}).catch(()=>{});};
  c.ontrack=e=>{RM(e.streams[0]||new MediaStream([e.track]));};
  // If the call has not connected within 20 seconds, offer help instead of an endless spinner.
  const watchdog=setTimeout(()=>{if(pc.current===c&&c.connectionState!=='connected')TR(true);},20000);
  c.onconnectionstatechange=()=>{const s=c.connectionState;if(s==='connected'){clearTimeout(watchdog);TR(false);}if(s==='failed'){TR(true);if(room?.side==='candidate')void send('hello').catch(()=>{});}ST(s==='connected'?'':s==='connecting'||s==='new'?'Connecting…':s==='disconnected'?'Connection unstable. Reconnecting…':s==='failed'?'The connection failed. Trying again…':'');
   if(s==='failed'&&room?.side==='employer')void c.createOffer({iceRestart:true}).then(o=>c.setLocalDescription(o)).then(()=>send('offer',{to,sdp:c.localDescription?.sdp,type:'offer'})).catch(()=>{});};
  return c;},[ice,send,room?.side]);
 const handle=useCallback(async(s:Signal)=>{
  const side=room?.side;
  if(s.kind==='hello'){
   if(side==='employer'&&s.side==='candidate'){const c=connection(s.peer);ST('Connecting…');const o=await c.createOffer();await c.setLocalDescription(o);await send('offer',{to:s.peer,sdp:o.sdp,type:'offer'});}
   else if(side==='candidate'&&s.side==='employer'&&!greeted.current.has(s.peer)){greeted.current.add(s.peer);ST('The interviewer is joining…');await send('hello');}
   return;}
  if(s.kind==='bye'){if(s.peer===other.current){pc.current?.close();pc.current=null;RM(null);ST(side==='employer'?'The applicant left the call.':'The interviewer left the call.');}return;}
  if(s.kind==='offer'&&side==='candidate'){const c=s.peer===other.current&&pc.current?pc.current:connection(s.peer);await c.setRemoteDescription({type:'offer',sdp:s.payload.sdp});
   for(const x of pending.current.splice(0))await c.addIceCandidate(x).catch(()=>{});const a=await c.createAnswer();await c.setLocalDescription(a);await send('answer',{to:s.peer,sdp:a.sdp,type:'answer'});return;}
  if(s.kind==='answer'&&s.peer===other.current&&pc.current){await pc.current.setRemoteDescription({type:'answer',sdp:s.payload.sdp});for(const x of pending.current.splice(0))await pc.current.addIceCandidate(x).catch(()=>{});return;}
  if(s.kind==='candidate'&&s.payload.candidate&&s.peer===other.current){const c=pc.current;if(c?.remoteDescription)await c.addIceCandidate(s.payload.candidate).catch(()=>{});else pending.current.push(s.payload.candidate);}
 },[room?.side,connection,send]);
 // Poll for setup messages while in the call.
 useEffect(()=>{if(phase!=='joined')return;let live=true,timer:ReturnType<typeof setTimeout>;
  const tick=async()=>{try{const d=await call<{signals:Signal[]}>(id,{action:'poll',peer:peer.current,after:after.current});for(const s of d.signals){after.current=Math.max(after.current,s.id);await handle(s).catch(()=>{});}}catch(e){if(live)ST((e as Error).message);}
   if(live)timer=setTimeout(tick,remote?2500:1000);};
  void tick();return()=>{live=false;clearTimeout(timer);};},[phase,id,handle,remote]);
 useEffect(()=>{if(phase!=='joined')return;const bye=()=>{try{navigator.sendBeacon(`/api/video/${id}`,new Blob([JSON.stringify({action:'signal',peer:peer.current,kind:'bye',payload:{}})],{type:'application/json'}));}catch{}};
  window.addEventListener('pagehide',bye);return()=>window.removeEventListener('pagehide',bye);},[phase,id]);
 async function join(){E('');try{await send('hello');P('joined');ST(room?.side==='employer'?'Waiting for the applicant to join…':'Waiting for the interviewer…');}catch(e){E((e as Error).message);}}
 // Restart the connection: the interviewer sends a fresh offer, the applicant asks for one.
 async function retry(){TR(false);ST('Reconnecting…');const c=pc.current;
  if(room?.side==='employer'&&c&&other.current){try{const o=await c.createOffer({iceRestart:true});await c.setLocalDescription(o);await send('offer',{to:other.current,sdp:o.sdp,type:'offer'});}catch{}}else{try{await send('hello');}catch{}}}
 // Audio only uses far less bandwidth, which helps on weak mobile or hotel connections.
 async function audioMode(){const sender=pc.current?.getSenders().find(x=>x.track?.kind==='video'||x.track===null);const camTrack=localRef.current?.getVideoTracks()[0];
  if(sender)await sender.replaceTrack(audioOnly?camTrack||null:null).catch(()=>{});if(camTrack)camTrack.enabled=audioOnly;C(audioOnly);AO(!audioOnly);}
 async function leave(){try{await send('bye');}catch{}pc.current?.close();pc.current=null;localRef.current?.getTracks().forEach(t=>t.stop());L(null);RM(null);P('left');}
 function toggle(kind:'audio'|'video'){const on=kind==='audio'?!mic:!cam;localRef.current?.getTracks().filter(t=>t.kind===kind).forEach(t=>{t.enabled=on;});if(kind==='audio')M(on);else C(on);}
 async function share(){const sender=pc.current?.getSenders().find(s=>s.track?.kind==='video');const camTrack=localRef.current?.getVideoTracks()[0];
  if(sharing){if(sender&&camTrack)await sender.replaceTrack(camTrack);SH(false);return;}
  try{const screen=await navigator.mediaDevices.getDisplayMedia({video:true});const track=screen.getVideoTracks()[0];if(sender)await sender.replaceTrack(track);SH(true);
   track.onended=()=>{if(sender&&camTrack)void sender.replaceTrack(camTrack);SH(false);};}catch{}}
 const back=room?room.side==='candidate'?`/account/applications/${room.applicationId}`:`/employer?view=applicants&application=${room.applicationId}`:'/';
 return <div className="vr">
  <header className="vr-top"><Brand/>{room&&<div><strong>{room.title}</strong><span>{time(room.startsAt,room.timeZone)}</span></div>}<Link href={back}>Back to application</Link></header>
  {error&&<p role="alert" className="vr-alert">{error}</p>}
  {phase==='left'?<main className="vr-end"><h1>You left the call</h1><p>Thanks for using JobRoles video.</p><div className="vr-actions"><button className="vr-btn" onClick={()=>{P('lobby');void startCamera();}}>Rejoin</button><Link className="vr-btn ghost" href={back}>Back to application</Link></div></main>:
  <main className={`vr-stage ${phase}`}>
   <div className="vr-remote">{phase==='lobby'?<><video ref={mine} className={`vr-mirror ${cam?'':'hidden'}`} autoPlay playsInline muted/><p className="vr-status">{local?'Check your camera and microphone, then join.':'Waiting for camera access…'}</p></>
    :remote?<video ref={theirs} autoPlay playsInline/>:<div className="vr-wait"><p>{status||'Waiting…'}</p></div>}
    {remote&&status&&<p className="vr-status" role="status">{status}</p>}</div>
   {phase==='joined'&&trouble&&<div className="vr-help" role="alert"><h2>Having trouble connecting?</h2><ul><li>Turn off any VPN, or switch from office or hotel Wi-Fi to mobile data.</li><li>Close other apps using your camera.</li><li>Try audio only if your connection is weak.</li></ul>
    <div className="vr-actions"><button className="vr-btn" onClick={retry}>Try again</button><button className="vr-btn ghost" onClick={audioMode}>{audioOnly?'Turn video back on':'Switch to audio only'}</button><Link className="vr-btn ghost" href={back}>Send a message instead</Link></div></div>}
   {phase==='joined'&&<div className={`vr-self ${cam?'':'off'}`}><video ref={mine} autoPlay playsInline muted/>{!cam&&<span>Camera off</span>}</div>}
  </main>}
  {phase!=='left'&&<footer className="vr-bar">
   <button className={`vr-round ${mic?'':'off'}`} onClick={()=>toggle('audio')} aria-pressed={!mic} disabled={!local}>{mic?'Mute':'Unmute'}</button>
   <button className={`vr-round ${cam?'':'off'}`} onClick={()=>toggle('video')} aria-pressed={!cam} disabled={!local}>{cam?'Stop video':'Start video'}</button>
   {phase==='joined'&&<button className={`vr-round ${audioOnly?'on':''}`} onClick={audioMode} aria-pressed={audioOnly}>{audioOnly?'Video on':'Audio only'}</button>}
   {phase==='joined'&&<button className={`vr-round ${sharing?'on':''}`} onClick={share} aria-pressed={sharing} disabled={!remote}>{sharing?'Stop sharing':'Share screen'}</button>}
   {phase==='lobby'?<button className="vr-btn" onClick={join} disabled={!room||room.cancelled}>Join call</button>:<button className="vr-btn danger" onClick={leave}>Leave</button>}
   {room&&phase==='lobby'&&<p className="vr-note">{room.cancelled?'This interview was cancelled.':`The room opens ${time(room.opensAt,room.timeZone)}. Audio and video go directly between you and the other person and are never recorded.`}</p>}
  </footer>}
 </div>;
}
