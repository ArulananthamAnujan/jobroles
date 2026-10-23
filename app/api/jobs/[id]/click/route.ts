import {createHash} from 'node:crypto';
import {rateLimit,clientIp} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// Records a click on a sponsored job. The visitor key is a one-way hash of IP, browser and day, so the employer is
// charged once per person per day and no address is stored. Always answers 204 so the page never waits on it.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,secret=process.env.AD_CLICK_SECRET,ip=clientIp(request);
 const done=new Response(null,{status:204});
 if(!UUID.test(id)||!secret||!process.env.SUPABASE_URL)return done;
 try{rateLimit(`ad-click:${ip}`,60,60_000);}catch{return done;}
 const ua=request.headers.get('user-agent')||'';
 if(!ua||/bot|crawl|spider|slurp|headless|preview/i.test(ua))return done;
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'});
 const visitor=createHash('sha256').update(`${secret}|${ip}|${ua}|${day}`).digest('hex');
 try{await fetch(`${process.env.SUPABASE_URL}/functions/v1/ad-click`,{method:'POST',headers:{'x-worker-secret':secret,apikey:process.env.SUPABASE_PUBLISHABLE_KEY||'','Content-Type':'application/json'},body:JSON.stringify({jobId:id,visitor}),cache:'no-store',signal:AbortSignal.timeout(5000)});}catch{}
 return done;
}
