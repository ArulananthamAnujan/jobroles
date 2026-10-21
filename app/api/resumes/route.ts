import {authenticatedClient,response,failure,sameOrigin,ApiError} from '@/lib/backend/server';
export async function POST(request:Request){try{
 sameOrigin(request);const {client,user}=await authenticatedClient();
 const length=Number(request.headers.get('content-length'));
 if(!Number.isFinite(length)||length<=0||length>11*1024*1024)throw new ApiError(413,'Upload one PDF or DOCX under 10 MB.');
 // Enforce a stream limit as well: Content-Length is never trusted alone.
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'File required.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>11*1024*1024){await reader.cancel();throw new ApiError(413,'File is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
 const file=form.get('resume');
 if(!(file instanceof File)||file.size===0||file.size>10*1024*1024)throw new ApiError(400,'Choose a PDF or DOCX under 10 MB.');
 const pdf=file.type==='application/pdf',docx=file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const signature=new Uint8Array(await file.slice(0,5).arrayBuffer());
 if(!(pdf&&new TextDecoder().decode(signature)==='%PDF-'||docx&&signature[0]===80&&signature[1]===75&&signature[2]===3&&signature[3]===4))throw new ApiError(400,'This file does not match its document type.');
 const filename=file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,180)||'resume';
 const key=`${user.id}/${crypto.randomUUID()}.${pdf?'pdf':'docx'}`;
 const {error:uploadError}=await client.storage.from('resumes').upload(key,file,{contentType:file.type,upsert:false});
 if(uploadError)throw new ApiError(400,'The resume could not be uploaded. Please try again.');
 const {data,error}=await client.rpc('jp_register_resume',{object_key:key,original_name:filename,content_type:file.type});
 if(error)throw new ApiError(400,'The file uploaded but could not be linked. Save your profile and try again.');
 return response({id:data,filename},201);
}catch(error){return failure(error);}}
