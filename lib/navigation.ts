export const accountViews=['overview','profile','saved','applications','jobs','hiring','analytics','candidates','feeds','reviews','privacy','preferences'];
export function accountView(search:string,hash:string){
 const p=new URLSearchParams(search),requested=p.get('view');
 const mapped:Record<string,string>={activity:'overview',application:'jobs',profile:'profile',saved:'saved',applications:'applications',privacy:'privacy',hiring:'hiring'};
 return mapped[hash.replace(/^#/,'')]||(accountViews.includes(requested||'')?requested!:p.has('job')?'jobs':'overview');
}
export function accountHref(view:string,search:string){const p=new URLSearchParams();p.set('view',accountViews.includes(view)?view:'overview');const job=new URLSearchParams(search).get('job');if(job)p.set('job',job);return `/account?${p}`;}
export function resultsHref(search:string){const input=new URLSearchParams(search),p=new URLSearchParams();for(const k of ['q','location','company','arrangement','type','sort','page','salaryMin','salaryMax','salaryPeriod','near','radius','posted','sector']){const v=input.get(k);if(v)p.set(k,v);}return `/search${p.size?'?'+p:''}`;}
