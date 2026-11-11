import OpenAI from 'openai';
import {authenticatedClient,ApiError,failure,jsonBody,response,sameOrigin} from '@/lib/backend/server';
import {rateLimit,clientIp} from '@/lib/backend/guard';
import {listingNotesSchema,listingDraftSchema,listingSystemPrompt} from '@/lib/listing-ai';
import {builtInDraft} from '@/lib/listing-draft';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const aiOn=()=>Boolean(process.env.OPENAI_API_KEY);
// Tells the form whether AI writing is available, so it only asks for consent when it is.
export async function GET(){return response({ai:aiOn()});}
// Turns an employer's notes into a listing or interview questions. It always works: without an AI key, or when the
// employer has not agreed to AI processing, or when the AI fails or the daily allowance is used up, the site
// organises the notes itself.
export async function POST(request:Request){try{
 sameOrigin(request);
 rateLimit(`ai:${clientIp(request)}`,20,60_000);
 const {client}=await authenticatedClient();
 const parsed=listingNotesSchema.safeParse(await jsonBody(request));
 if(!parsed.success)throw new ApiError(400,'Enter the job title and location in the form, and at least 30 characters of notes about the role.');
 const input=parsed.data;
 const builtIn=(note?:string)=>{const draft=builtInDraft(input);return response({draft:note?{...draft,reviewNotes:[note,...draft.reviewNotes].slice(0,8)}:draft,task:input.task,source:'builtin'});};
 if(!aiOn()||!input.consent)return builtIn();
 const {data:allowed,error}=await client.rpc('jp_listing_ai_quota',{p_company:input.companyId});
 if(error)throw new ApiError(403,'The writing assistant is for company owners and recruiters.');
 if(!allowed)return builtIn('Today’s AI allowance is used (10 a day, a minute apart), so this was organised from your notes without AI.');
 try{
  const ai=new OpenAI({timeout:35000,maxRetries:0});
  const completion=await ai.chat.completions.create({model:process.env.JOB_LISTING_AI_MODEL||'gpt-4.1-mini',max_completion_tokens:2000,response_format:{type:'json_object'},messages:[{role:'system',content:listingSystemPrompt},{role:'user',content:JSON.stringify({title:input.title,location:input.location,type:input.type,arrangement:input.arrangement,brief:input.brief,task:input.task})}]});
  if(completion.choices[0]?.finish_reason!=='stop')throw new Error('incomplete');
  return response({draft:listingDraftSchema.parse(JSON.parse(completion.choices[0]?.message.content||'')),task:input.task,source:'ai'});
 }catch{return builtIn('AI writing was unavailable just now, so this was organised from your notes without AI.');}
}catch(error){return failure(error);}}
