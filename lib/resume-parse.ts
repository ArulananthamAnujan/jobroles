// Reads profile details out of the plain text of a resume, with no outside service.
// It is deliberately cautious: a field is filled only when the text clearly says it, and left empty otherwise,
// because the person reviews every field before saving.
export type ResumeSuggestion={name:string;headline:string;location:string;skills:string[]};
const STATES='NSW|VIC|QLD|WA|SA|TAS|ACT|NT';
const STATE_NAMES:Record<string,string>={'new south wales':'NSW',victoria:'VIC',queensland:'QLD','western australia':'WA','south australia':'SA',tasmania:'TAS','australian capital territory':'ACT','northern territory':'NT'};
const CITIES:Record<string,string>={sydney:'NSW',melbourne:'VIC',brisbane:'QLD',perth:'WA',adelaide:'SA',canberra:'ACT',hobart:'TAS',darwin:'NT','gold coast':'QLD',newcastle:'NSW',wollongong:'NSW',geelong:'VIC',cairns:'QLD',townsville:'QLD',parramatta:'NSW',ballarat:'VIC',bendigo:'VIC',launceston:'TAS',toowoomba:'QLD','sunshine coast':'QLD'};
// Section headings that end one part of a resume and start another.
const HEADING=/^(?:professional |career |personal |key |core |technical |relevant |work |employment )?(?:summary|profile|objective|about me|experience|history|employment|education|qualifications?|training|skills?(?: (?:and|&) (?:abilities|competencies|expertise))?|competencies|expertise|strengths|licen[cs]es?(?: (?:and|&) (?:certifications?|tickets?))?|certifications?|certificates?|tickets?|achievements?|awards?|projects?|referees?|references?|interests?|hobbies|languages?|volunteer(?:ing)?|contact(?: details)?)\s*:?$/i;
const SKILL_HEADING=/^(?:key |core |technical |relevant |professional )?(?:skills?(?: (?:and|&) (?:abilities|competencies|expertise))?|competencies|expertise|strengths|licen[cs]es?(?: (?:and|&) (?:certifications?|tickets?))?|certifications?|tickets?)\s*:?$/i;
const TITLE_WORDS=/\b(manager|supervisor|coordinator|co-ordinator|assistant|officer|engineer|developer|designer|analyst|nurse|carer|worker|driver|operator|technician|mechanic|electrician|plumber|carpenter|labourer|chef|cook|barista|waiter|waitress|bartender|cleaner|teacher|educator|tutor|accountant|bookkeeper|administrator|receptionist|consultant|specialist|adviser|advisor|representative|associate|director|lead|leader|foreman|storeperson|picker|packer|cashier|clerk|planner|scheduler|architect|scientist|pharmacist|physiotherapist|paramedic|guard|apprentice|trainee|graduate|intern|student|executive|recruiter|writer|editor|marketer|merchandiser|buyer|estimator|surveyor|inspector|agent|handler|attendant|host|housekeeper|gardener|painter|welder|fitter|machinist|rigger|scaffolder|bricklayer|tiler|roofer|glazier|concreter|plasterer|butcher|baker)\b/i;
// Skills, licences and tools that Australian employers search for. Matched as whole words anywhere in the resume.
const KNOWN_SKILLS=['Forklift licence','Forklift','White Card','First Aid','CPR','RSA','RSG','Working with Children Check','Police check','NDIS Worker Screening','Driver licence','HR licence','MR licence','HC licence','MC licence','Manual handling','Customer service','Cash handling','Point of sale','Stock control','Inventory management','Rostering','Scheduling','Team leadership','Staff training','Workplace health and safety','WHS','Risk assessment','Quality assurance','Data entry','Microsoft Office','Microsoft Excel','Excel','Word','PowerPoint','Outlook','Xero','MYOB','QuickBooks','SAP','Salesforce','Accounts payable','Accounts receivable','Payroll','Bookkeeping','BAS','Budgeting','Forecasting','Project management','Agile','Scrum','JavaScript','TypeScript','Python','Java','C#','SQL','React','Node.js','AWS','Azure','Docker','Kubernetes','Git','HTML','CSS','Figma','Photoshop','AutoCAD','Revit','Medication administration','Wound care','Patient care','Aged care','Disability support','Personal care','Manual handling training','AHPRA registration','Food safety','Food handling','Barista','Knife skills','Menu planning','Welding','Scaffolding','Rigging','Dogging','EWP','Confined space','Working at heights','Test and tag','Traffic control','Pick and pack','RF scanning','Dispatch','Reach truck','Order picking','Negotiation','Sales','Account management','Social media','SEO','Copywriting','Public speaking','Report writing','Conflict resolution','Problem solving','Time management','Communication'];
const clean=(s:string)=>s.replace(/[•●▪‣⁃·▪■●○◦➢➤✓✔]/g,'•').replace(/\t/g,' ').replace(/ {2,}/g,' ').trim();
const title=(s:string)=>s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\b(Mc)([a-z])/g,(_,a:string,b:string)=>a+b.toUpperCase()).replace(/\bO'([a-z])/g,(_,b:string)=>`O'${b.toUpperCase()}`);
const contactish=(l:string)=>/@|https?:|www\.|linkedin|\+?\d[\d ()-]{6,}\d/i.test(l);
function findName(lines:string[]){
 for(const raw of lines.slice(0,8)){
  const l=raw.replace(/^(?:name|resume of|curriculum vitae of|cv of)\s*[:\-–]?\s*/i,'').replace(/\s*[|•–-]\s*(?:resume|curriculum vitae|cv)$/i,'').trim();
  if(!l||contactish(l)||HEADING.test(l)||/^(resume|curriculum vitae|cv)$/i.test(l)||/\d/.test(l))continue;
  const words=l.split(' ');
  if(words.length>=2&&words.length<=4&&words.every(w=>/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/.test(w))&&!TITLE_WORDS.test(l))return /^[A-Z '’.-]+$/.test(l)?title(l):l;
 }
 return '';
}
function findLocation(lines:string[]){
 const head=lines.slice(0,20).join('\n');
 const withState=head.match(new RegExp(`([A-Z][A-Za-z'’]+(?: [A-Z][A-Za-z'’]+){0,2}),? (${STATES})\\b(?: \\d{4})?`));
 if(withState&&!/^(Level|Unit|Suite|Street|Road|Avenue|Drive|Po Box)$/i.test(withState[1]))return `${withState[1]} ${withState[2]}`;
 const lower=head.toLowerCase();
 for(const [name,abbr] of Object.entries(STATE_NAMES)){const m=head.match(new RegExp(`([A-Z][A-Za-z'’]+(?: [A-Z][A-Za-z'’]+)?),? ${name}`,'i'));if(m&&m[1].toLowerCase()!==name)return `${m[1]} ${abbr}`;}
 const city=Object.keys(CITIES).find(c=>new RegExp(`\\b${c}\\b`).test(lower));
 return city?`${title(city)} ${CITIES[city]}`:'';
}
function findHeadline(lines:string[],name:string){
 const start=name?Math.max(0,lines.findIndex(l=>l.toLowerCase().includes(name.toLowerCase().split(' ')[0]))):0;
 // A short line near the top that reads like a job title.
 for(const l of lines.slice(start,start+6)){
  if(l.toLowerCase()===name.toLowerCase()||contactish(l)||HEADING.test(l)||l.length>70||l.split(' ').length>8)continue;
  if(TITLE_WORDS.test(l)&&!/[.!?]$/.test(l)){const t=l.split(/\s+[–-]\s+|,\s|\s+at\s+/)[0].replace(/\s*[|•]\s*/g,' · ').trim();if(TITLE_WORDS.test(t))return t;}
 }
 // Otherwise the first job title under the work history heading.
 const exp=lines.findIndex(l=>/^(?:professional |work |employment |career )?(?:experience|history|employment)(?: history)?\s*:?$/i.test(l));
 if(exp>=0)for(const l of lines.slice(exp+1,exp+5)){const t=l.split(/\s+[|•–-]\s+|,\s/)[0].replace(/^•\s*/,'').trim();if(t.length<=60&&TITLE_WORDS.test(t)&&!contactish(t))return t;}
 return '';
}
function findSkills(lines:string[],whole:string){
 const found:string[]=[];
 const add=(s:string)=>{const v=s.replace(/^[•\-–*·\s]+/,'').replace(/[.;:,]+$/,'').trim();if(v.length>=2&&v.length<=60&&v.split(' ').length<=6&&!contactish(v)&&!found.some(f=>f.toLowerCase()===v.toLowerCase()))found.push(v);};
 lines.forEach((l,i)=>{
  if(!SKILL_HEADING.test(l))return;
  for(const item of lines.slice(i+1,i+25)){if(HEADING.test(item))break;for(const part of item.split(/[,;|•]| {3,}|\s[–-]\s/))add(part);}
 });
 // Inline form: "Skills: Excel, Xero, payroll"
 for(const l of lines){const m=l.match(/^(?:key |core |technical )?skills?\s*[:\-–]\s*(.+)$/i);if(m)for(const part of m[1].split(/[,;|•]/))add(part);}
 const lower=` ${whole.toLowerCase()} `;
 for(const k of KNOWN_SKILLS){if(found.length>=20)break;const at=lower.search(new RegExp(`[^a-z0-9]${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[^a-z0-9]`));if(at>=0&&!found.some(f=>f.toLowerCase().includes(k.toLowerCase())||k.toLowerCase().includes(f.toLowerCase())))found.push(k);}
 return found.slice(0,20);
}
export function parseResume(text:string):ResumeSuggestion{
 const all=text.split(/\r?\n/).map(clean).filter(Boolean).slice(0,600);
 // Headers often put name, role and place on one line ("Sam Seeker - Warehouse Supervisor - Sydney NSW").
 const lines=[...all.slice(0,6).flatMap(l=>l.split(/\s+[|•–—-]\s+/).map(x=>x.trim()).filter(Boolean)),...all.slice(6)];
 const name=findName(lines);
 return {name,headline:findHeadline(lines,name).slice(0,240),location:findLocation(lines).slice(0,160),skills:findSkills(lines,lines.join('\n'))};
}
