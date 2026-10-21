import {authenticatedClient,response,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(){try{
 const {client,user}=await authenticatedClient();
 const [messages,history,interviews]=await Promise.all([
 client.from('application_messages').select('id,application_id,body,created_at').neq('sender_id',user.id).order('created_at',{ascending:false}).limit(30),
 client.from('application_stage_history').select('id,application_id,to_state,created_at').neq('actor_id',user.id).order('created_at',{ascending:false}).limit(30),
 client.from('interviews').select('id,application_id,starts_at,time_zone,format,cancelled_at,created_at').order('created_at',{ascending:false}).limit(30),
 ]);
 if(messages.error||history.error||interviews.error)throw new ApiError(503,'Recent activity could not be loaded.');
 // Every source uses the caller's JWT and its existing application-specific RLS policy.
 const activity=[...(messages.data||[]).map(m=>({id:m.id,applicationId:m.application_id,kind:'Message',text:m.body.slice(0,240),at:m.created_at})),...(history.data||[]).map(h=>({id:h.id,applicationId:h.application_id,kind:'Application update',text:h.to_state.replaceAll('_',' '),at:h.created_at})),...(interviews.data||[]).map(i=>({id:i.id,applicationId:i.application_id,kind:i.cancelled_at?'Interview cancelled':'Interview scheduled',text:i.format.slice(0,240),at:i.cancelled_at||i.created_at,startsAt:i.starts_at,timeZone:i.time_zone}))].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,50);
 return response({activity});
}catch(error){return failure(error);}}
