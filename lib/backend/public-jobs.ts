import {createClient} from '@supabase/supabase-js';
import {ApiError,backendConfigured} from './server';
export function publicJobsClient(){
 if(!backendConfigured())throw new ApiError(503,'Job search is temporarily unavailable. Please try again shortly.');
 return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export const jobFields='id,company_id,title,description,employment_type,arrangement,salary_min,salary_max,salary_period,currency,published_at,expires_at,benefits,start_date,external_apply_url,companies!inner(id,name,about,verified_at),job_locations!inner(label)';
