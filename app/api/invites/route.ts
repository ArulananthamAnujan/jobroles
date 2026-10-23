import {authenticatedClient,failure,response,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// Invitations from employers to roles. Job and company details come through the public listing rules.
export async function GET(){try{
 const {client,user}=await authenticatedClient();
 const {data,error}=await client.from('candidate_invites').select('id,job_id,message,created_at,jobs(title,state,companies(name))').eq('seeker_id',user.id).is('dismissed_at',null).order('created_at',{ascending:false}).limit(30);
 if(error)throw new ApiError(503,'Invitations could not be loaded.');
 return response({invites:data});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();const body=await jsonBody(request) as {id?:unknown};
 if(typeof body?.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))throw new ApiError(400,'Choose an invitation.');
 const {error}=await client.rpc('jp_dismiss_invite',{target:body.id});if(error)throw new ApiError(400,'Could not dismiss the invitation.');
 return response({ok:true});
}catch(e){return failure(e);}}
