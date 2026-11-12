import type {SupabaseClient} from '@supabase/supabase-js';
import {docxText} from '../resume-text';
import {parseResumeDetails,type ResumeDetails} from '../resume-parse';
// Reading an uploaded resume and using it, so people are not asked to type what their resume already says.

/** The text of a PDF or Word resume. Scanned PDFs are pictures of text and give an empty string. */
export async function resumeText(bytes:Uint8Array){
 const pdf=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';
 try{
  if(!pdf)return docxText(bytes).slice(0,40000);
  const {extractText,getDocumentProxy}=await import('unpdf');
  const {text}=await extractText(await getDocumentProxy(bytes.slice()),{mergePages:false});
  return (Array.isArray(text)?text.slice(0,12).join('\n'):String(text)).slice(0,40000);
 }catch{return '';}
}
export type Filled={profile:string[];builder:string[]};
const count=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
/**
 * Fills in whatever the person has not already entered: their headline, location and skills, and, when their resume
 * builder is still empty, their summary, work history, education, licences and languages. Nothing they typed is
 * replaced. Returns what was filled so the page can say so.
 */
export async function autofillFromResume(client:SupabaseClient,userId:string,text:string):Promise<Filled>{
 const filled:Filled={profile:[],builder:[]};
 if(text.replace(/\s/g,'').length<40)return filled;
 const d:ResumeDetails=parseResumeDetails(text);
 const {data:p}=await client.from('seeker_profiles').select('full_name,headline,location,skills,searchable,summary,experience,education,licences,languages,desired_titles,desired_pay,desired_period,desired_types,ready_to_work,availability').eq('user_id',userId).maybeSingle();
 if(!p)return filled;
 const headline=p.headline||d.headline,location=p.location||d.location,skills=(p.skills as string[]|null)?.length?p.skills as string[]:d.skills;
 if(!p.headline&&d.headline)filled.profile.push('headline');
 if(!p.location&&d.location)filled.profile.push('location');
 if(!(p.skills as string[]|null)?.length&&d.skills.length)filled.profile.push(count(d.skills.length,'skill','skills'));
 if(filled.profile.length){
  const {error}=await client.rpc('jp_command',{action:'profile.save',payload:{name:p.full_name,headline:headline.slice(0,240),location:location.slice(0,160),skills:skills.slice(0,50).map(s=>s.slice(0,80)),searchable:Boolean(p.searchable)}});
  if(error)filled.profile=[];
 }
 const empty=!p.summary&&!(p.experience as unknown[]|null)?.length&&!(p.education as unknown[]|null)?.length;
 if(empty&&(d.summary||d.experience.length||d.education.length||d.licences.length||d.languages.length)){
  const licences=(p.licences as string[]|null)?.length?p.licences as string[]:d.licences,languages=(p.languages as string[]|null)?.length?p.languages as string[]:d.languages;
  const {error}=await client.rpc('jp_save_career_profile',{payload:{summary:d.summary,
   experience:d.experience.map(e=>({title:e.title,company:e.company,...(e.location?{location:e.location}:{}),start:e.start,end:e.end||null,...(e.description?{description:e.description}:{})})),
   education:d.education,licences,languages,desiredTitles:p.desired_titles||[],desiredPay:p.desired_pay,desiredPeriod:p.desired_period,desiredTypes:p.desired_types||[],readyToWork:Boolean(p.ready_to_work),availability:p.availability||''}});
  if(!error){
   if(d.summary)filled.builder.push('summary');
   if(d.experience.length)filled.builder.push(count(d.experience.length,'job','jobs'));
   if(d.education.length)filled.builder.push(count(d.education.length,'qualification','qualifications'));
   if(!(p.licences as string[]|null)?.length&&d.licences.length)filled.builder.push(count(d.licences.length,'licence','licences'));
   if(!(p.languages as string[]|null)?.length&&d.languages.length)filled.builder.push(count(d.languages.length,'language','languages'));
  }
 }
 return filled;
}
/** A sentence saying what was filled in, or an empty string when nothing was. */
export function filledSentence(f:Filled){
 const join=(a:string[])=>a.length>1?`${a.slice(0,-1).join(', ')} and ${a[a.length-1]}`:a[0]||'';
 const parts=[f.profile.length?`filled in your ${join(f.profile)}`:'',f.builder.length?`added your ${join(f.builder)} to the resume builder`:''].filter(Boolean);
 return parts.length?`We read it and ${parts.join(', and ')}. Check them over.`:'';
}
