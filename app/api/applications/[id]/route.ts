import {authenticatedClient,response,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Application unavailable.');
 const {client,user}=await authenticatedClient();
 const {data:application,error}=await client.from('applications').select('*').eq('id',id).maybeSingle();
 if(error||!application)throw new ApiError(404,'Application unavailable.');
 const isSeeker=application.seeker_id===user.id;
 if(!isSeeker){const {error:viewError}=await client.rpc('jp_command',{action:'application.view',payload:{id}});if(viewError)throw new ApiError(403,'Application access denied.');}
 const [snapshot,history,notes,interviews,messages,job,draft]=await Promise.all([
  client.from('application_snapshots').select('*').eq('application_id',id).maybeSingle(),
  client.from('application_stage_history').select('id,to_state,created_at,reason').eq('application_id',id).order('created_at').limit(200),
  client.from('application_notes').select('id,body,rating,created_at').eq('application_id',id).order('created_at',{ascending:false}).limit(100),
  client.from('interviews').select('id,starts_at,time_zone,format,cancelled_at').eq('application_id',id).order('starts_at',{ascending:false}).limit(50),
  client.from('application_messages').select('id,sender_id,body,created_at').eq('application_id',id).order('created_at',{ascending:false}).limit(100),
  client.from('jobs').select('id,title,company_id,screening_questions(id,question,must_have,expected_answer)').eq('id',application.job_id).maybeSingle(),
  isSeeker?client.from('application_drafts').select('*').eq('application_id',id).maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 if([snapshot,history,notes,interviews,messages,job,draft].some(x=>x.error))throw new ApiError(503,'Application details could not be loaded.');
 const {data:membership}=job.data?await client.from('company_memberships').select('role').eq('company_id',job.data.company_id).eq('user_id',user.id).is('revoked_at',null).maybeSingle():{data:null};
 return response({application,isSeeker,userId:user.id,role:membership?.role||null,snapshot:snapshot.data,history:history.data,notes:notes.data,interviews:interviews.data,messages:messages.data?.reverse(),job:job.data,draft:draft.data});
}catch(error){return failure(error);}}
