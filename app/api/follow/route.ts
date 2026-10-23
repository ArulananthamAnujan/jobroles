import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const company=new URL(request.url).searchParams.get('company')||'';if(!/^[0-9a-f-]{36}$/i.test(company))throw new ApiError(400,'Choose a company.');const {client}=await authenticatedClient();const {data}=await client.rpc('jp_is_following',{company});return response({following:Boolean(data)});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();const b=await jsonBody(request) as {companyId?:unknown;follow?:unknown};
 if(typeof b?.companyId!=='string'||typeof b.follow!=='boolean')throw new ApiError(400,'Choose a company.');
 const {data,error}=await client.rpc('jp_follow_company',{company:b.companyId,follow:b.follow});
 if(error)throw new ApiError(error.code==='42501'?403:400,['42501','22023'].includes(error.code)?error.message:'Could not update.');
 return response(data);
}catch(e){return failure(e);}}
