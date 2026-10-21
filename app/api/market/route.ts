import {publicJobsClient} from '@/lib/backend/public-jobs';
import {response,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
export async function GET(){try{const client=publicJobsClient(),now=new Date(),week=new Date(now.getTime()-7*86400000);const base=()=>client.from('jobs').select('id',{count:'exact',head:true}).eq('state','live').gt('expires_at',now.toISOString());const [all,recent,remote]=await Promise.all([base(),base().gte('published_at',week.toISOString()),base().eq('arrangement','remote')]);if(all.error||recent.error||remote.error)throw new ApiError(503,'Job counts are temporarily unavailable.');return response({total:all.count||0,recent:recent.count||0,remote:remote.count||0,asOf:now.toISOString()});}catch(e){return failure(e);}}
