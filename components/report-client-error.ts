'use client';
export function reportClientError(error:Error&{digest?:string}){
 try{void fetch('/api/errors',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({message:error.digest?`${error.message} (digest ${error.digest})`:error.message,stack:error.stack?.slice(0,4000),path:location.pathname})});}catch{}
}
