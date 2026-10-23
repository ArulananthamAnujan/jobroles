import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
import {jobFields} from '@/lib/backend/public-jobs';
export const dynamic='force-dynamic';
export async function GET(){try{
 const {client}=await authenticatedClient();
 const {data:hits,error}=await client.rpc('jp_recommend_jobs',{p_limit:10});
 if(error)throw new ApiError(503,'Recommendations are unavailable right now.');
 const ranked=(hits||[]) as {job_id:string;distance_km:number|null}[];
 if(!ranked.length)return response({jobs:[]});
 const {data,error:jobError}=await client.from('jobs').select(jobFields).in('id',ranked.map(h=>h.job_id));
 if(jobError)throw new ApiError(503,'Recommendations are unavailable right now.');
 const byId=new Map((data||[]).map(j=>[(j as {id:string}).id,j]));
 return response({jobs:ranked.filter(h=>byId.has(h.job_id)).map(h=>({...byId.get(h.job_id)!,distance_km:h.distance_km===null?null:Math.round(h.distance_km)}))});
}catch(e){return failure(e);}}
