// Organises an employer's own notes into a job listing, or into interview questions, with no outside service.
// It only rearranges what the employer wrote: nothing about pay, requirements or benefits is added.
export type Brief={title:string;location:string;type:string;arrangement:string;brief:string;task:'draft'|'improve'|'interview'};
export type Draft={title:string;description:string;reviewNotes:string[]};
const SETTING:Record<string,string>={on_site:'On-site',hybrid:'Hybrid',remote:'Remote'};
const REQUIREMENT=/\b(must|require[ds]?|essential|mandatory|licen[cs]e|ticket|certificate|certification|qualif|degree|diploma|registration|experience|years?|proven|ability to|able to|right to work|police check|working with children|wwcc|ndis|clearance|competent|proficient|knowledge of)\b/i;
const BENEFIT=/\b(benefits?|parking|superannuation|bonus|leave|discount|training provided|paid training|flexible|flexibility|salary packag|uniform|career|progression|development|allowance|company car|vehicle provided|work from home days?|employee assistance|eap|free)\b/i;
// A sentence about money belongs with what the employer offers, even when it also mentions experience or years.
const PAY=/\$\s?\d|\b(salary|wage|wages|pay rate|hourly rate|penalty rates|per hour|an hour|per annum|per year|a year|p\.?a\.?|plus super|\+\s?super|superannuation|bonus|commission|overtime (?:is )?paid)\b/i;
const HOURS=/\b(hours?|shift work|night shifts?|rotating roster|rostered|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekends?|weekdays?|nights?|\d{1,2}(?::\d{2})?\s?(?:am|pm)|days? (?:a|per) week|fortnight)\b/i;
const sentence=(s:string)=>{const t=s.replace(/^[\s•\-–*·\d.)]+/,'').replace(/\s+/g,' ').trim();return t?t[0].toUpperCase()+t.slice(1).replace(/[.;,]+$/,''):'';};
const lowerFirst=(s:string)=>/^[A-Z][a-z]/.test(s)?s[0].toLowerCase()+s.slice(1):s;
function facts(text:string){
 return [...new Set(text.split(/\r?\n|;|•|(?<=[.!?])\s+(?=[A-Z$])/).map(sentence).filter(f=>f.length>=4&&f.length<=400&&!/^existing description:?$/i.test(f)))].slice(0,40);
}
export function builtInDraft(input:Brief):Draft{
 const all=facts(input.brief),money=all.filter(f=>PAY.test(f)),need=all.filter(f=>!money.includes(f)&&REQUIREMENT.test(f)),perks=[...money,...all.filter(f=>!money.includes(f)&&!need.includes(f)&&BENEFIT.test(f))],hours=all.filter(f=>!need.includes(f)&&!perks.includes(f)&&HOURS.test(f)),duties=all.filter(f=>!need.includes(f)&&!perks.includes(f)&&!hours.includes(f));
 const title=input.title.trim();
 if(input.task==='interview'){
  const questions=[
   `What interests you about the ${title} role, and what would you bring to it?`,
   ...duties.slice(0,3).map(d=>`This role involves the following: ${lowerFirst(d)}. Tell us about a time you did similar work and how it went.`),
   ...need.slice(0,3).map(r=>`We ask for this: ${lowerFirst(r)}. How do you meet it? Please give a recent example.`),
   'Describe a time something went wrong at work. What did you do, and what was the result?',
   'How do you organise your work when several things are due at once?',
   ...(hours.length?[`The hours for this role are: ${lowerFirst(hours[0])}. Does that suit you, and is there anything we should know about your availability?`]:['What is your availability, and when could you start?']),
   'What questions do you have for us about the role or the team?',
  ].slice(0,10);
  return {title:`Interview questions: ${title}`.slice(0,140),description:questions.map((q,i)=>`${i+1}. ${q}`).join('\n'),reviewNotes:['Built from your notes without AI. Ask every candidate the same questions and keep them about the job.','Do not ask about age, family plans, health, religion, origin or other personal characteristics.']};
 }
 const list=(items:string[])=>items.map(i=>`• ${i}`).join('\n');
 const parts=[
  `About the role\n${title} · ${input.type} · ${SETTING[input.arrangement]||input.arrangement} · ${input.location.split('\n').map(l=>l.trim()).filter(Boolean).join(', ')}`,
  duties.length?`What you’ll do\n${list(duties)}`:'',
  need.length?`What you’ll need\n${list(need)}`:'',
  hours.length?`Hours\n${list(hours)}`:'',
  perks.length?`${money.length?'Pay and benefits':'What we offer'}\n${list(perks)}`:'',
  'How to apply\nApply through JobRoles with your resume. We read every application and will let you know the outcome.',
 ].filter(Boolean);
 const notes=['Organised from your notes without AI. Nothing was added, so anything missing here is missing from your notes.'];
 if(!duties.length)notes.push('Add what the person will actually do day to day.');
 if(!need.length)notes.push('Add the genuine requirements, such as licences, checks or experience. Leave out anything that is not really essential.');
 if(!hours.length)notes.push('Add the hours or roster if you know them. Listings that state them get more suitable applicants.');
 notes.push('Enter the pay range in the form: it is shown on the listing and is not taken from these notes.');
 return {title:title.slice(0,140),description:parts.join('\n\n').slice(0,12000),reviewNotes:notes.slice(0,8)};
}
