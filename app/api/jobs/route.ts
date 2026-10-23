import {failure,response,ApiError} from '@/lib/backend/server';
import {rateLimit,clientIp} from '@/lib/backend/guard';
import {publicJobsClient,jobFields} from '@/lib/backend/public-jobs';
import {salaryOptions} from '@/lib/salary';
import {buildQuery,parseFilters} from '@/lib/search';
export const dynamic='force-dynamic';
const PAGE=20;
export async function GET(request:Request){try{
 rateLimit(`search:${clientIp(request)}`,120,60_000);
 const url=new URL(request.url),filters=parseFilters(url.searchParams);
 let salary;try{salary=salaryOptions(url.searchParams);}catch(e){throw new ApiError(400,(e as Error).message);}
 const query=buildQuery(filters.q,filters.sector),client=publicJobsClient();
 const run=(page:number)=>client.rpc('jp_search_jobs',{p_query:query?.text??null,p_query_mode:query?.mode??'websearch',p_location:filters.location||null,p_company:filters.company||null,p_arrangement:filters.arrangement||null,p_type:filters.type||null,p_salary_min:salary.minimum,p_salary_max:salary.maximum,p_period:salary.period,p_posted_days:filters.posted,p_near:filters.near||null,p_radius_km:filters.near?filters.radius:null,p_sort:filters.sort,p_limit:PAGE,p_offset:(page-1)*PAGE});
 let {data:hits,error}=await run(filters.page);
 if(error?.code==='22023')throw new ApiError(400,error.message);
 if(error)throw error;
 // Results may shrink between page requests (closed roles or changed filters).
 if(!hits?.length&&filters.page>1){filters.page=1;({data:hits,error}=await run(1));if(error)throw error;}
 const ranked=(hits||[]) as {job_id:string;distance_km:number|null;total_count:number}[];
 if(!ranked.length)return response({jobs:[],total:0,page:filters.page,pageSize:PAGE,filters:{...filters,salary}});
 const {data:rows,error:rowError}=await client.from('jobs').select(jobFields).in('id',ranked.map(h=>h.job_id));
 if(rowError)throw rowError;
 const byId=new Map((rows||[]).map(r=>[(r as {id:string}).id,r]));
 const jobs=ranked.filter(h=>byId.has(h.job_id)).map(h=>({...byId.get(h.job_id)!,distance_km:h.distance_km===null?null:Math.round(h.distance_km)}));
 return response({jobs,total:Number(ranked[0].total_count),page:filters.page,pageSize:PAGE,filters:{...filters,salary}});
}catch(error){return failure(error);}}
