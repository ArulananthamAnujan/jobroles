// Which "Continue with …" buttons to show. Supabase is asked which providers are switched on in its dashboard, so
// enabling one there is all it takes; nothing has to be set where the site is hosted. The answer is kept for five
// minutes. AUTH_PROVIDERS (or the older NEXT_PUBLIC_AUTH_PROVIDERS) overrides it: a comma-separated list, or "none".
const SUPPORTED=['google','apple','linkedin_oidc'] as const;
export type Provider=typeof SUPPORTED[number];
let cached:{at:number;list:Provider[]}|null=null;
const only=(names:string[])=>SUPPORTED.filter(p=>names.includes(p));
export async function enabledProviders(send:typeof fetch=fetch,now=Date.now()):Promise<Provider[]>{
 const fixed=process.env.AUTH_PROVIDERS??process.env.NEXT_PUBLIC_AUTH_PROVIDERS;
 if(fixed?.trim())return only(fixed.split(',').map(s=>s.trim()));
 if(cached&&now-cached.at<5*60_000)return cached.list;
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return [];
 try{
  const r=await send(`${url}/auth/v1/settings`,{headers:{apikey:key},cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(!r.ok)throw new Error(String(r.status));
  const external=((await r.json()) as {external?:Record<string,unknown>}).external||{};
  cached={at:now,list:only(Object.keys(external).filter(k=>external[k]===true))};
 }catch{
  // Keep showing what worked last time; with no earlier answer, show none and ask again on the next request.
  return cached?.list??[];
 }
 return cached.list;
}
export function forgetProviders(){cached=null;}
