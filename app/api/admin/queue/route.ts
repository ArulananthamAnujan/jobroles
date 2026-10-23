import {authenticatedClient,failure,response,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// Administrator work queues. Row-level security already limits these rows to platform administrators.
export async function GET(){try{
 const {client}=await authenticatedClient();
 const {data:isAdmin}=await client.rpc('jp_is_admin');if(isAdmin!==true)throw new ApiError(403,'Administrators only.');
 const [jobs,companies,audit]=await Promise.all([
  client.from('jobs').select('id,title,description,employment_type,arrangement,salary_min,salary_max,salary_period,created_at,external_apply_url,companies(id,name,verified_at),job_locations(label)').eq('state','pending_review').order('created_at').limit(100),
  client.from('companies').select('id,name,abn,about,is_agency,created_at,website').is('verified_at',null).order('created_at').limit(100),
  client.from('audit_log').select('id,action,entity_type,reason,created_at').order('created_at',{ascending:false}).limit(100)]);
 if(jobs.error||companies.error||audit.error)throw new ApiError(503,'Queues unavailable.');
 const {data:risks}=jobs.data.length?await client.rpc('jp_job_risk',{targets:jobs.data.map(j=>j.id)}):{data:[]};
 return response({jobs:jobs.data,companies:companies.data,audit:audit.data,risks:risks||[]});
}catch(e){return failure(e);}}
