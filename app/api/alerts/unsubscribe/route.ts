import {publicJobsClient} from '@/lib/backend/public-jobs';
import {failure,response,ApiError} from '@/lib/backend/server';
import {rateLimit,clientIp} from '@/lib/backend/guard';
// One-click unsubscribe (RFC 8058). Mail providers POST here from their own servers, so there is no
// same-origin check; the 64-character token from the email is the authorisation.
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){try{
 rateLimit(`unsubscribe:${clientIp(request)}`,30,60_000);
 const p=new URL(request.url).searchParams,id=p.get('id')||'',token=p.get('token')||'';
 if(!UUID.test(id)||!/^[0-9a-f]{64}$/.test(token))throw new ApiError(400,'This unsubscribe link is incomplete.');
 const {data,error}=await publicJobsClient().rpc('jp_unsubscribe_alert',{target:id,secret:token});
 if(error)throw error;if(!data)throw new ApiError(404,'This alert was already removed or the link has expired.');
 return response({ok:true});
}catch(e){return failure(e);}}
