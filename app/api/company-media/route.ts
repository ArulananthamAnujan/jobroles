import {authenticatedClient,failure,response,sameOrigin,ApiError} from '@/lib/backend/server';
import {rateLimit} from '@/lib/backend/guard';
// Logo, cover and workplace photos. Storage policies allow writes only into the owner's company folder.
export async function POST(request:Request){try{
 sameOrigin(request);const {client,user}=await authenticatedClient();rateLimit(`media:${user.id}`,30,60*60_000);
 const length=Number(request.headers.get('content-length'));if(!Number.isFinite(length)||length<=0||length>5.5*1024*1024)throw new ApiError(413,'Images must be under 5 MB.');
 const form=await request.formData(),file=form.get('file'),company=String(form.get('companyId')||'');
 if(!/^[0-9a-f-]{36}$/i.test(company))throw new ApiError(400,'Choose a company.');
 if(!(file instanceof File)||file.size===0||file.size>5*1024*1024)throw new ApiError(400,'Choose a JPEG, PNG or WebP image under 5 MB.');
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const type=b[0]===0xff&&b[1]===0xd8?'jpg':b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47?'png':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'?'webp':null;
 if(!type)throw new ApiError(400,'Choose a JPEG, PNG or WebP image.');
 const path=`${company}/${crypto.randomUUID()}.${type}`;
 const {error}=await client.storage.from('company-media').upload(path,file,{contentType:type==='jpg'?'image/jpeg':`image/${type}`,upsert:false});
 if(error)throw new ApiError(403,'Only the company owner can upload images.');
 return response({url:`${process.env.SUPABASE_URL}/storage/v1/object/public/company-media/${path}`},201);
}catch(e){return failure(e);}}
