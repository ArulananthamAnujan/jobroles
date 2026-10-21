export type AuthMailError={status?:number;code?:string}|null;
export function mailFailure(error:AuthMailError){
 if(!error)return null;
 if(error.status===429||error.code==='over_email_send_rate_limit'||error.code==='over_request_rate_limit')return {status:429,message:'Too many email requests. Wait a few minutes before trying again.'};
 if(error.code==='email_not_confirmed'||error.code==='user_not_found'||error.code==='email_exists')return null;
 return {status:503,message:'We could not send the email right now. Please try again later or contact support.'};
}
export function confirmationFields(hash:unknown,type:unknown){
 if(typeof hash!=='string'||hash.length<1||hash.length>512||!['signup','email','recovery'].includes(String(type)))return null;
 return {token_hash:hash,type:type as 'signup'|'email'|'recovery'};
}
export function confirmationDestination(type:string){return type==='recovery'?'/account/reset':'/account?confirmed=1';}
