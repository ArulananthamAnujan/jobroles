import {authenticatedClient,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
async function allRows<T>(page:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{code?:string}|null}>){
 const rows:T[]=[];
 for(let offset=0;offset<25000;offset+=500){const {data,error}=await page(offset,offset+499);if(error?.code==='PGRST103')return rows;if(error)throw new ApiError(503,'Export unavailable. Please try again.');rows.push(...(data||[]));if((data?.length||0)<500)return rows;}
 throw new ApiError(413,'Your export requires administrator assistance. Submit an access request in Privacy controls.');
}
export async function GET(){try{
 const {client,user}=await authenticatedClient();
 const profile=await client.from('seeker_profiles').select('*').eq('user_id',user.id).maybeSingle();if(profile.error)throw profile.error;
 const own=(table:string,fields:string,column='user_id')=>allRows((from,to)=>client.from(table).select(fields).eq(column,user.id).order('id').range(from,to));
 const [applications,resumes,searches,reports,requests,messages,savedJobs,blocks]=await Promise.all([
 own('applications','*,application_snapshots(*),application_stage_history(*)','seeker_id'),
 own('resume_versions','id,filename,version,created_at,deleted_at'),own('saved_searches','id,filters,frequency,created_at'),
 own('job_reports','id,job_id,reason,state,resolution,created_at','reporter_id'),own('privacy_requests','id,kind,detail,status,response,created_at,updated_at'),
 allRows((from,to)=>client.from('application_messages').select('id,application_id,sender_id,body,created_at,applications!inner(seeker_id)').eq('applications.seeker_id',user.id).order('id').range(from,to)),
 allRows((from,to)=>client.from('saved_jobs').select('job_id,created_at').eq('user_id',user.id).order('job_id').range(from,to)),
 allRows((from,to)=>client.from('company_blocks').select('company_id,created_at').eq('seeker_id',user.id).order('company_id').range(from,to)),
 ]);
 const body=JSON.stringify({exportedAt:new Date().toISOString(),email:user.email,profile:profile.data,applications,resumes,savedSearches:searches,savedJobs,companyBlocks:blocks,messages,jobReports:reports,privacyRequests:requests},null,2);
 if(body.length>25*1024*1024)throw new ApiError(413,'Your export requires administrator assistance. Submit an access request in Privacy controls.');
 return new Response(body,{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="jobroles-data.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(error){return failure(error);}}
