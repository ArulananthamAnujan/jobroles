import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// Whether the signed-in person is registered, with the joining link if so.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Event unavailable.');
 const {client}=await authenticatedClient();const {data,error}=await client.rpc('jp_my_event',{target:id});if(error)throw new ApiError(400,'Event unavailable.');
 return response(data);
}catch(e){return failure(e);}}
