import {authenticatedClient,response,failure} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {client,user}=await authenticatedClient();const url=new URL(request.url);
 const page=Math.max(1,Math.min(1000,Number(url.searchParams.get('page'))||1));
 const {data,error,count}=await client.from('saved_jobs').select('job_id,created_at,jobs(id,title,state,expires_at,companies(name))',{count:'exact'}).eq('user_id',user.id).order('created_at',{ascending:false}).order('job_id').range((Math.floor(page)-1)*20,Math.floor(page)*20-1);
 if(error)throw error;return response({saved:data,total:count,page:Math.floor(page)});
}catch(error){return failure(error);}}
