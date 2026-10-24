// ICE servers for video interviews. Public STUN always; a TURN relay when configured, so calls also connect on
// strict office and hotel networks. Cloudflare TURN gives short-lived credentials per call; a static TURN server
// (for example coturn) can be used instead.
type Env=Record<string,string|undefined>;
type Ice={urls:string|string[];username?:string;credential?:string};
export async function iceServers(env:Env=process.env,send:typeof fetch=fetch):Promise<Ice[]>{
 const servers:Ice[]=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
 const keyId=env.CLOUDFLARE_TURN_KEY_ID,token=env.CLOUDFLARE_TURN_API_TOKEN;
 if(keyId&&token){
  try{
   const r=await send(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:4*3600}),signal:AbortSignal.timeout(5000),cache:'no-store'});
   const d=await r.json() as {iceServers?:Ice|Ice[]};
   if(r.ok&&d.iceServers)servers.push(...(Array.isArray(d.iceServers)?d.iceServers:[d.iceServers]).filter(s=>s.username&&s.credential));
  }catch{}
 }
 if(env.TURN_URL)servers.push({urls:env.TURN_URL.split(',').map(u=>u.trim()).filter(Boolean),username:env.TURN_USERNAME,credential:env.TURN_CREDENTIAL});
 return servers;
}
