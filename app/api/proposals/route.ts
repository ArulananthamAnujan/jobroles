import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// Interview times offered to the applicant, and their choice.
export async function GET(request:Request){try{
 const app=new URL(request.url).searchParams.get('application')||'';if(!/^[0-9a-f-]{36}$/i.test(app))throw new ApiError(400,'Choose an application.');
 const {client}=await authenticatedClient();const {data,error}=await client.from('interview_proposals').select('id,slots,time_zone,format,chosen,cancelled_at,created_at').eq('application_id',app).order('created_at',{ascending:false}).limit(5);
 if(error)throw new ApiError(503,'Interview times unavailable.');return response({proposals:data});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();const b=await jsonBody(request) as {id?:unknown;slot?:unknown};
 if(typeof b?.id!=='string'||typeof b.slot!=='string')throw new ApiError(400,'Choose a time.');
 const {data,error}=await client.rpc('jp_choose_slot',{proposal:b.id,slot:b.slot});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Could not confirm the time.');
 return response(data);
}catch(e){return failure(e);}}
