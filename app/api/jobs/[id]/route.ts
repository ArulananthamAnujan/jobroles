import {ApiError,failure,response} from '@/lib/backend/server';
import {publicJobsClient,jobFields} from '@/lib/backend/public-jobs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'This job is not available.');
 const {data,error}=await publicJobsClient().from('jobs').select(jobFields).eq('id',id).eq('state','live').gt('expires_at',new Date().toISOString()).maybeSingle();
 if(error)throw error;if(!data)throw new ApiError(404,'This job has closed or is no longer available.');return response({job:data});
}catch(error){return failure(error);}}
