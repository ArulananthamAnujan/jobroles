import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

export function backendConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}
export async function accountClient() {
  if (!backendConfigured()) throw new ApiError(503, 'Accounts are awaiting database connection.');
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: {httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/'},
    cookies: {getAll: () => jar.getAll(), setAll: values => {for (const {name,value,options} of values) jar.set(name,value,options);}},
  });
}
export async function authenticatedClient() {
  const client = await accountClient();
  const {data,error} = await client.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'Please sign in to continue.');
  if (!data.user.email_confirmed_at) throw new ApiError(403, 'Confirm your email before continuing.');
  return {client,user:data.user};
}
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function response(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});}
export function failure(error:unknown){
  if (error instanceof ApiError) return response({error:error.message},error.status);
  // Unexpected failures are reported; the client still gets a generic message.
  void import('../error-report').then(m=>m.reportError(error,{source:'api'})).catch(()=>{});
  return response({error:'The request could not be completed. Please try again.'},500);
}
export function sameOrigin(request:Request){
  const origin=request.headers.get('origin');
  const expected=process.env.APP_ORIGIN?.replace(/\/$/,'') || (process.env.NODE_ENV==='production'?null:new URL(request.url).origin);
  if(!expected) throw new ApiError(503,'This site is not fully configured. Please contact support.');
  if (!origin || origin !== expected) throw new ApiError(403,'This request must come from the application.');
}
export async function jsonBody(request:Request){
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415,'JSON required.');
  const reader=request.body?.getReader();
  if (!reader) throw new ApiError(400,'Request body required.');
  let size=0; const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new ApiError(413,'Request is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'Invalid JSON.');}
}
