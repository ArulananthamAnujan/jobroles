import {authenticatedClient,failure,ApiError} from '@/lib/backend/server';
export const dynamic='force-dynamic';
// Applicants for one job as CSV for the hiring team. Cells starting with = + - @ are prefixed so spreadsheets do not run them.
const cell=(v:unknown)=>{let s=v===null||v===undefined?'':String(v);if(/^[=+\-@\t\r]/.test(s))s=`'${s}`;return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export async function GET(request:Request){try{
 const job=new URL(request.url).searchParams.get('job')||'';if(!/^[0-9a-f-]{36}$/i.test(job))throw new ApiError(400,'Choose a job.');
 const {client}=await authenticatedClient();
 const [{data,error},{data:questions}]=await Promise.all([client.rpc('jp_pipeline',{target:job}),client.from('screening_questions').select('id,question').eq('job_id',job).order('position')]);
 if(error)throw new ApiError(error.code==='42501'?403:503,'Applicants unavailable.');
 const qs=(questions||[]) as {id:string;question:string}[];
 const rows=[['Name','Email','Headline','Location','Stage','Status','Applied','Meets requirements',...qs.map(q=>q.question)],...((data||[]) as {full_name:string;email:string;headline:string;location:string;stage:string;state:string;submitted_at:string;meets_requirements:boolean;answers:Record<string,string>}[]).map(a=>[a.full_name,a.email,a.headline,a.location,a.stage,a.state,a.submitted_at,a.meets_requirements?'Yes':'No',...qs.map(q=>a.answers?.[q.id]??'')])];
 return new Response('﻿'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="applicants-${job.slice(0,8)}.csv"`,'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
