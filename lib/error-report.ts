// Reports errors to the platform log and, when SENTRY_DSN is set, to Sentry's envelope API (no SDK needed).
// Messages are trimmed and stripped of email addresses and long tokens before they leave the server.
export function scrub(text:string){return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b(eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9_-]{32,})\b/g,'[token]').slice(0,2000);}
export function sentryEnvelope(dsn:string,event:{message:string;stack?:string;source:string;path?:string;level?:'error'|'warning'},now=new Date()){
 const u=new URL(dsn),project=u.pathname.replace(/^\//,''),id=crypto.randomUUID().replace(/-/g,'');
 const url=`${u.protocol}//${u.host}/api/${project}/envelope/?sentry_key=${u.username}&sentry_version=7`;
 const body={event_id:id,timestamp:now.getTime()/1000,platform:'javascript',level:event.level??'error',environment:process.env.CONTEXT||process.env.NODE_ENV,release:process.env.COMMIT_REF,tags:{source:event.source},transaction:event.path,
  exception:{values:[{type:'Error',value:scrub(event.message),stacktrace:event.stack?{frames:scrub(event.stack).split('\n').slice(0,30).reverse().map(l=>({function:l.trim()}))}:undefined}]}};
 return {url,payload:`${JSON.stringify({event_id:id,sent_at:now.toISOString(),dsn})}\n${JSON.stringify({type:'event'})}\n${JSON.stringify(body)}`};
}
export async function reportError(error:unknown,context:{source:string;path?:string},send:typeof fetch=fetch){
 const message=error instanceof Error?error.message:String(error),stack=error instanceof Error?error.stack:undefined;
 console.error(`[${context.source}] ${context.path??''} ${scrub(message)}`);
 const dsn=process.env.SENTRY_DSN;if(!dsn)return;
 try{const {url,payload}=sentryEnvelope(dsn,{message,stack,...context});await send(url,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body:payload,signal:AbortSignal.timeout(3000)});}catch{}
}
