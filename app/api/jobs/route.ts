import {failure,response} from '@/lib/backend/server';
import {publicJobsClient,searchOptions,literalPattern,jobFields} from '@/lib/backend/public-jobs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const filters=searchOptions(new URL(request.url));
 let query=publicJobsClient().from('jobs').select(jobFields,{count:'exact'}).eq('state','live').gt('expires_at',new Date().toISOString());
 if(filters.q)query=query.ilike('title',literalPattern(filters.q));
 if(filters.location)query=query.ilike('job_locations.label',literalPattern(filters.location));
 if(filters.company)query=query.ilike('companies.name',literalPattern(filters.company));
 if(filters.arrangement)query=query.eq('arrangement',filters.arrangement);
 if(filters.type)query=query.eq('employment_type',filters.type);
 // Salary sort uses annual roles only, so hourly and annual amounts are never compared.
 if(filters.sort==='salary')query=query.eq('salary_period','year').order('salary_min',{ascending:false,nullsFirst:false});
 query=query.order('published_at',{ascending:false}).order('id');
 let result=await query.range((filters.page-1)*20,filters.page*20-1);
 // Results may shrink between page requests (closed roles or changed filters).
 if(result.error?.code==='PGRST103'){filters.page=1;result=await query.range(0,19);}
 if(result.error)throw result.error;
 return response({jobs:result.data,total:result.count,page:filters.page,pageSize:20,filters});
}catch(error){return failure(error);}}
