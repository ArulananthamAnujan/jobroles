import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// What the signed-in person has already done with this job: saved it, or applied (and to which application).
// It lets the buttons say "Saved" and "Applied" instead of offering the same action again.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Job not found.');
 const {client,user}=await authenticatedClient();
 const [saved,applied]=await Promise.all([
  client.from('saved_jobs').select('job_id').eq('user_id',user.id).eq('job_id',id).maybeSingle(),
  client.from('applications').select('id,state').eq('seeker_id',user.id).eq('job_id',id).maybeSingle()]);
 const a=applied.data as {id:string;state:string}|null;
 return response({saved:Boolean(saved.data),application:a?{id:a.id,state:a.state}:null});
}catch(e){return failure(e);}}
