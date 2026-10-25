import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// Everything the job seeker's home screen shows, in one call.
export async function GET(){try{
 const {client,user}=await authenticatedClient();const {data,error}=await client.rpc('jp_seeker_home');
 if(error)throw new ApiError(503,'Your home screen could not be loaded.');
 return response({...data,email:user.email});
}catch(e){return failure(e);}}
