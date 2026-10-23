import {reportError} from '@/lib/error-report';
import {rateLimit,clientIp} from '@/lib/backend/guard';
import {sameOrigin} from '@/lib/backend/server';
// Browser errors from the error boundaries. Same-origin, small, rate-limited; nothing is returned.
export async function POST(request:Request){
 try{sameOrigin(request);rateLimit(`errors:${clientIp(request)}`,20,60_000);
  const text=await request.text();if(text.length>8000)return new Response(null,{status:413});
  const d=JSON.parse(text) as {message?:unknown;stack?:unknown;path?:unknown;digest?:unknown};
  if(typeof d.message!=='string')return new Response(null,{status:400});
  await reportError(Object.assign(new Error(d.message),{stack:typeof d.stack==='string'?d.stack:undefined}),{source:'browser',path:typeof d.path==='string'?d.path.slice(0,200):undefined});
 }catch{}
 return new Response(null,{status:204});
}
