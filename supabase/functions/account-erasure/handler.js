// Completes an approved deletion request. The caller's own token must belong to an active platform administrator;
// only then does the function use the service role to erase rows, resume files and the sign-in identity.
export function makeErasureHandler(createClient,env){
 const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 return async request=>{
  try{
   if(request.method!=='POST')return reply(405,{error:'Method not allowed.'});
   const authorization=request.headers.get('authorization');
   if(!authorization?.startsWith('Bearer '))return reply(401,{error:'Sign in required.'});
   const url=env('SUPABASE_URL');
   const caller=createClient(url,env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:identity,error:authError}=await caller.auth.getUser(authorization.slice(7));
   if(authError||!identity.user?.email_confirmed_at)return reply(401,{error:'Confirmed account required.'});
   const {data:isAdmin,error:adminError}=await caller.rpc('jp_is_admin');
   if(adminError||isAdmin!==true)return reply(403,{error:'Administrator required.'});
   const raw=await request.text();if(raw.length>256)return reply(413,{error:'Request too large.'});
   let target;try{({userId:target}=JSON.parse(raw));}catch{return reply(400,{error:'Invalid request.'});}
   if(typeof target!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(target))return reply(400,{error:'Invalid account.'});
   if(target===identity.user.id)return reply(400,{error:'Administrators cannot erase their own account here.'});
   const service=createClient(url,env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await service.rpc('jp_erase_account',{target,reviewer:identity.user.id});
   if(error)return reply(error.code==='22023'?409:error.code==='42501'?403:503,{error:error.code==='22023'?error.message:'Erasure failed. Nothing was changed.'});
   const keys=data?.storageKeys||[];let filesRemoved=true;
   if(keys.length){const {error:removeError}=await service.storage.from('resumes').remove(keys);if(removeError)filesRemoved=false;}
   // Soft delete keeps the user row for foreign keys but strips the identity and blocks sign-in.
   const {error:userError}=await service.auth.admin.deleteUser(target,true);
   return reply(200,{erased:true,filesRemoved,identityRemoved:!userError});
  }catch{return reply(500,{error:'Erasure could not be completed.'});}
 };
}
