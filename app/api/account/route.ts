import {mailFailure} from '@/lib/auth-mail';
import {z} from 'zod';
import {accountClient,backendConfigured,response,failure,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {rateLimit,clientIp,verifyCaptcha,appOrigin} from '@/lib/backend/guard';
export const dynamic='force-dynamic';
export async function GET(){try{
 if(!backendConfigured())return response({configured:false,user:null});
 const client=await accountClient();const {data}=await client.auth.getUser();
 return response({configured:true,user:data.user?{id:data.user.id,email:data.user.email,confirmed:Boolean(data.user.email_confirmed_at)}:null});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 sameOrigin(request);
 const ip=clientIp(request);
 const raw=await jsonBody(request);
 const body=z.discriminatedUnion('action',[
  z.object({action:z.literal('login'),email:z.string().email(),password:z.string().min(1).max(128),captcha:z.string().optional()}),
  z.object({action:z.literal('signup'),email:z.string().email(),password:z.string().min(12).max(128),captcha:z.string().optional()}),
  z.object({action:z.literal('logout')}),
  z.object({action:z.literal('reset'),email:z.string().trim().email(),captcha:z.string().optional()}),
  z.object({action:z.literal('resend'),email:z.string().trim().email(),captcha:z.string().optional()}),
  z.object({action:z.literal('password'),password:z.string().min(12).max(128)}),
 ]).safeParse(raw);
 if(!body.success)throw new ApiError(400,'Enter a valid email and password. New passwords need at least 12 characters.');
 if(body.data.action!=='logout'){rateLimit(`auth:${ip}`,10,60_000);if(body.data.action==='reset'||body.data.action==='resend')rateLimit(`auth-email:${body.data.email.toLowerCase()}`,5,15*60_000);}
 if(['login','signup','reset','resend'].includes(body.data.action))await verifyCaptcha((body.data as {captcha?:string}).captcha,ip);
 const client=await accountClient();
 if(body.data.action==='logout'){const {error}=await client.auth.signOut();if(error)throw new ApiError(400,'Could not sign out. Try again.');return response({ok:true});}
 if(body.data.action==='reset'||body.data.action==='resend'){
  const result=body.data.action==='reset'?await client.auth.resetPasswordForEmail(body.data.email,{redirectTo:`${appOrigin()}/auth/callback?flow=recovery`}):await client.auth.resend({type:'signup',email:body.data.email,options:{emailRedirectTo:`${appOrigin()}/auth/callback`}});
  const problem=mailFailure(result.error);if(problem)throw new ApiError(problem.status,problem.message);
  return response({ok:true});
 }
 if(body.data.action==='password'){const {data,error:identityError}=await client.auth.getUser();if(identityError||!data.user)throw new ApiError(401,'Open your password recovery link first.');const {error}=await client.auth.updateUser({password:body.data.password});if(error)throw new ApiError(400,'Password could not be updated. Request a fresh recovery link.');await client.auth.signOut({scope:'global'});return response({ok:true});}
 const {action,email,password}=body.data as {action:'login'|'signup';email:string;password:string};
 const result=action==='login'?await client.auth.signInWithPassword({email,password}):await client.auth.signUp({email,password,options:{emailRedirectTo:`${appOrigin()}/auth/callback`}});
 if(result.error)throw new ApiError(result.error.status===429?429:400,action==='login'?'Sign-in failed. Check your email, password and email confirmation.':'Account could not be created. Please try again later.');
 return response({ok:true,confirmationRequired:action==='signup'&&!result.data.session});
}catch(error){return failure(error);}}
