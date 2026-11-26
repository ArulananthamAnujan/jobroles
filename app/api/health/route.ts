import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// For uptime monitors: 200 when the app can reach the database, 503 otherwise. Reveals no data.
// It also says which build is running (code version and when it was built), so a deploy can be confirmed.
export async function GET(){
 const headers={'Cache-Control':'no-store'};
 if(!backendConfigured()||!process.env.APP_ORIGIN)return Response.json({ok:false,reason:'configuration'},{status:503,headers});
 try{const {error}=await publicJobsClient().from('jobs').select('id',{head:true,count:'exact'}).limit(1);if(error)throw error;return Response.json({ok:true,build:process.env.BUILD_ID||'unknown',builtAt:process.env.BUILD_AT||null},{headers});}
 catch{return Response.json({ok:false,reason:'database'},{status:503,headers});}
}
