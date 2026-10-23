import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const ids=(new URL(request.url).searchParams.get('ids')||'').split(',').filter(x=>/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)).slice(0,200);
 if(!ids.length)return response({risks:[]});
 const {client}=await authenticatedClient();const {data,error}=await client.rpc('jp_job_risk',{targets:ids});
 if(error)throw new ApiError(error.code==='42501'?403:503,'Risk flags are for administrators.');
 return response({risks:data});
}catch(e){return failure(e);}}
