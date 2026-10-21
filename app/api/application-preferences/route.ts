import {authenticatedClient,response,failure,sameOrigin,jsonBody,ApiError} from '@/lib/backend/server';
import {preferenceInput} from '@/lib/application-preferences';
export async function GET(){try{const {client,user}=await authenticatedClient();const {data,error}=await client.from('application_preferences').select('*').eq('user_id',user.id).maybeSingle();if(error)throw new ApiError(503,'Application preferences are unavailable.');return response({preferences:data});}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const {client,user}=await authenticatedClient();const parsed=preferenceInput.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(400,'Complete the required preferences and acknowledge the setup conditions.');const p=parsed.data;
 if(p.mode==='automatic'){const {data,error}=await client.from('resume_versions').select('id').eq('id',p.resumeId).eq('user_id',user.id).is('deleted_at',null).maybeSingle();if(error||!data)throw new ApiError(400,'Choose one of your available resume versions.');}
 const row={user_id:user.id,mode:p.mode,criteria:p.mode==='automatic'?p.criteria:{},resume_version_id:p.mode==='automatic'?p.resumeId:null,setup_acknowledged:p.mode==='automatic',sending_enabled:false,updated_at:new Date().toISOString()};
 const {error}=await client.from('application_preferences').upsert(row);if(error)throw new ApiError(503,'Could not save your preferences.');return response({ok:true,active:false});
}catch(e){return failure(e);}}
