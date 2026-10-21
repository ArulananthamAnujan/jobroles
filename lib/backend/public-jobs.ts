import {createClient} from '@supabase/supabase-js';
import {ApiError,backendConfigured} from './server';
export function publicJobsClient(){
 if(!backendConfigured())throw new ApiError(503,'Job search is temporarily unavailable. Please try again shortly.');
 return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function searchOptions(url:URL){
 const read=(key:string,max=120)=>(url.searchParams.get(key)||'').trim().slice(0,max);
 const raw=Number(read('page',8)||1);
 const arrangement=read('arrangement');
 const type=read('type');
 return {q:read('q'),location:read('location'),company:read('company'),arrangement:['on_site','hybrid','remote'].includes(arrangement)?arrangement:'',type:['Full-time','Part-time','Casual','Contract','Temporary','Internship'].includes(type)?type:'',sort:read('sort')==='salary'?'salary':'newest',page:Number.isSafeInteger(raw)?Math.min(Math.max(raw,1),1000):1};
}
export function literalPattern(value:string){return `%${value.replace(/[\\%_]/g,'\\$&')}%`;}
export const jobFields='id,company_id,title,description,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,expires_at,companies!inner(id,name,about,verified_at),job_locations!inner(label)';
