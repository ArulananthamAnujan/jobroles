import OpenAI from 'openai';
import {authenticatedClient,ApiError,failure,jsonBody,response,sameOrigin} from '@/lib/backend/server';
import {rateLimit,clientIp} from '@/lib/backend/guard';
import {listingBriefSchema,listingDraftSchema,listingSystemPrompt} from '@/lib/listing-ai';
export const runtime='nodejs';
export async function POST(request:Request){try{
 sameOrigin(request);
 rateLimit(`ai:${clientIp(request)}`,20,60_000);
 const {client}=await authenticatedClient();
 const parsed=listingBriefSchema.safeParse(await jsonBody(request));
 if(!parsed.success)throw new ApiError(400,'Provide a job title, location and at least 30 characters of role facts, and agree to AI processing.');
 const input=parsed.data;
 if(!process.env.OPENAI_API_KEY)throw new ApiError(503,'The AI assistant is awaiting activation. You can continue writing your listing manually.');
 const {data:allowed,error}=await client.rpc('jp_listing_ai_quota',{p_company:input.companyId});
 if(error)throw new ApiError(403,'AI drafting requires an active owner or recruiter membership.');
 if(!allowed)throw new ApiError(429,'Please wait one minute between requests. Each account can make up to 10 requests per UTC day.');
 const ai=new OpenAI({timeout:35000,maxRetries:0});
 let completion;
 try{completion=await ai.chat.completions.create({model:process.env.JOB_LISTING_AI_MODEL||'gpt-4.1-mini',max_completion_tokens:2000,response_format:{type:'json_object'},messages:[{role:'system',content:listingSystemPrompt},{role:'user',content:JSON.stringify({title:input.title,location:input.location,type:input.type,arrangement:input.arrangement,brief:input.brief,task:input.task})}]});}
 catch{throw new ApiError(502,'AI drafting is temporarily unavailable. Your form has been preserved; please try later or continue manually.');}
 if(completion.choices[0]?.finish_reason!=='stop')throw new ApiError(502,'The AI draft was incomplete. Please shorten your brief and try again.');
 let draft;try{draft=listingDraftSchema.parse(JSON.parse(completion.choices[0]?.message.content||''));}catch{throw new ApiError(502,'The AI returned an unusable draft. Please try again or write manually.');}
 return response({draft,task:input.task});
}catch(error){return failure(error);}}
