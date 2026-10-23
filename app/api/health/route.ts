import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// For uptime monitors: 200 when the app can reach the database, 503 otherwise. Reveals no data.
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 if(!backendConfigured()||!process.env.APP_ORIGIN)return Response.json({ok:false,reason:'configuration'},{status:503,headers});
 try{const {error}=await publicJobsClient().from('jobs').select('id',{head:true,count:'exact'}).limit(1);if(error)throw error;return Response.json({ok:true},{headers});}
 catch{return Response.json({ok:false,reason:'database'},{status:503,headers});}
}
