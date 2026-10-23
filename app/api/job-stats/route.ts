import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const company=new URL(request.url).searchParams.get('company')||'';
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(company))throw new ApiError(400,'Choose a company.');
 const {client}=await authenticatedClient();
 const {data,error}=await client.rpc('jp_job_stats',{company});
 if(error)throw new ApiError(error.code==='42501'?403:503,error.code==='42501'?'Only owners and recruiters can see listing statistics.':'Statistics are unavailable right now.');
 return response({stats:data});
}catch(e){return failure(e);}}
