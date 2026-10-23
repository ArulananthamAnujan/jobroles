import {authenticatedClient,failure,ApiError} from '@/lib/backend/server';
import {interviewIcs} from '@/lib/calendar';
export const dynamic='force-dynamic';
// Calendar file for an interview the caller can see (row-level security decides), for Google, Outlook or Apple Calendar.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params;if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new ApiError(404,'Interview unavailable.');
 const {client}=await authenticatedClient();
 const {data,error}=await client.from('interviews').select('id,application_id,starts_at,time_zone,format,cancelled_at,applications(jobs(title,companies(name)))').eq('id',id).maybeSingle();
 if(error||!data)throw new ApiError(404,'Interview unavailable.');
 const job=(data.applications as unknown as {jobs:{title:string;companies:{name:string}}}|null)?.jobs;
 const ics=interviewIcs({id:data.id,startsAt:data.starts_at,format:data.format,cancelled:Boolean(data.cancelled_at),title:job?`Interview: ${job.title} at ${job.companies.name}`:'JobRoles interview',url:`${process.env.APP_ORIGIN||''}/account/applications/${data.application_id}`});
 return new Response(ics,{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="interview.ics"','Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
