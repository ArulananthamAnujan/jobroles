import {accountClient} from '@/lib/backend/server';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,code=p.get('code');let next='/account/verify?error=invalid';
 if(code&&code.length<=4096){try{const client=await accountClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)next=p.get('flow')==='recovery'?'/account/reset':'/account?confirmed=1';}catch{}}
 return new Response(null,{status:303,headers:{Location:next,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
