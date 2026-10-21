import {authenticatedClient,response,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {client,user}=await authenticatedClient();
 const params=new URL(request.url).searchParams;
 let page=Math.max(0,Math.min(10000,Math.floor(Number(params.get('page'))||0)));
 const [{data:isAdmin,error:adminError},{data:memberships,error:memberError}]=await Promise.all([client.rpc('jp_is_admin'),client.from('company_memberships').select('company_id,user_id,role,revoked_at').is('revoked_at',null)]);
 if(adminError||memberError)throw new ApiError(503,'Workspace could not be loaded.');
 const companyIds=(memberships||[]).filter(m=>m.user_id===user.id).map(m=>m.company_id);
 const {data:jobs,error:jobError}=await client.from('jobs').select('id,title,company_id,state').in('company_id',companyIds).limit(500);
 if(jobError)throw new ApiError(503,'Roles could not be loaded.');
 let applicantQuery=client.from('applications').select('id,job_id,state,stage,submitted_at,reinstatement_requested_at,jobs!inner(title,company_id),application_snapshots(profile,answers)',{count:'exact'}).in('jobs.company_id',companyIds).neq('state','draft');
 const stage=params.get('stage');if(['new','reviewed','shortlisted','interview','offer','hired','rejected'].includes(stage||''))applicantQuery=applicantQuery.eq('stage',stage!);
 applicantQuery=applicantQuery.order('submitted_at',{ascending:false}).order('id');
 let applicantResult=await applicantQuery.range(page*30,page*30+29);
 if(applicantResult.error?.code==='PGRST103'){page=0;applicantResult=await applicantQuery.range(0,29);}
 if(applicantResult.error)throw new ApiError(503,'Applicants could not be loaded.');
 const {data:applications,count}=applicantResult;
 const [companies,audit]=isAdmin?await Promise.all([client.from('companies').select('id,name,abn,verified_at,is_agency').is('verified_at',null).order('created_at').limit(100),client.from('audit_log').select('id,action,entity_type,reason,created_at').order('created_at',{ascending:false}).limit(100)]):[{data:[],error:null},{data:[],error:null}];
 if(companies.error||audit.error)throw new ApiError(503,'Admin workspace could not be loaded.');
 return response({userId:user.id,isAdmin,jobs,applications,total:count||0,page,memberships,companies:companies.data,audit:audit.data});
}catch(error){return failure(error);}}
