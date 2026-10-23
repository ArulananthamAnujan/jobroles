import {z} from 'zod';
import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
const subscription=z.object({endpoint:z.string().url().startsWith('https://').max(1000),keys:z.object({p256dh:z.string().min(80).max(100),auth:z.string().min(16).max(30)})});
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const parsed=subscription.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'This browser returned an unusable subscription.');
 const {error}=await client.rpc('jp_save_push',{p_endpoint:parsed.data.endpoint,p_p256dh:parsed.data.keys.p256dh,p_auth:parsed.data.keys.auth});
 if(error)throw new ApiError(400,'Notifications could not be turned on.');return response({ok:true});
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();const body=await jsonBody(request) as {endpoint?:unknown};
 if(typeof body?.endpoint!=='string')throw new ApiError(400,'Missing subscription.');
 await client.rpc('jp_delete_push',{p_endpoint:body.endpoint});return response({ok:true});
}catch(e){return failure(e);}}
