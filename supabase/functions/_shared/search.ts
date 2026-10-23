// Turns what people type into a ranked search: synonym groups for Australian job titles, sectors as keyword sets,
// and validated filters for the jp_search_jobs database function.
export const SYNONYMS:string[][]=[
 ['rn','registered nurse'],['en','enrolled nurse'],['ain','assistant in nursing'],['pca','personal care assistant','personal care worker'],
 ['aged care','aged care worker','personal care worker'],['disability support','disability support worker','ndis support worker','support worker'],
 ['gp','general practitioner'],['physio','physiotherapist'],['ot','occupational therapist'],['psych','psychologist'],
 ['dev','developer','software engineer'],['swe','software engineer'],['frontend','front end','front-end'],['backend','back end','back-end'],['devops','site reliability engineer'],
 ['admin','administration','administrator'],['pa','personal assistant'],['ea','executive assistant'],['hr','human resources'],['bdm','business development manager'],
 ['pm','project manager'],['ba','business analyst'],['qa','quality assurance','tester'],
 ['chef','cook'],['kitchen hand','kitchenhand','dishwasher'],['barista','coffee'],['waiter','waitress','food and beverage attendant'],
 ['labourer','laborer','general hand'],['sparky','electrician'],['chippy','carpenter'],['tradie','tradesperson'],['plumber','plumbing'],
 ['forklift','lf licence','forklift operator'],['truck driver','hr driver','mr driver','hc driver'],['warehouse','storeperson','picker packer'],
 ['accountant','cpa','ca'],['bookkeeper','accounts payable','accounts receivable'],
 ['teacher','educator'],['ece','early childhood educator','childcare'],['teacher aide','education support'],
 ['retail','sales assistant','shop assistant'],['customer service','call centre','contact centre'],['cleaner','cleaning'],
];
export const SECTORS:Record<string,{label:string;terms:string[]}>={
 healthcare:{label:'Healthcare & nursing',terms:['nurse','doctor','physiotherapist','pharmacist','midwife','radiographer','clinical','health']},
 care:{label:'Aged & disability care',terms:['aged care','disability support','support worker','personal care','ndis']},
 technology:{label:'Technology',terms:['software','developer','engineer','data','cloud','devops','analyst','it support']},
 trades:{label:'Trades & construction',terms:['electrician','plumber','carpenter','builder','labourer','construction','apprentice','mechanic']},
 logistics:{label:'Warehousing & logistics',terms:['warehouse','forklift','driver','storeperson','logistics','supply chain','dispatch']},
 hospitality:{label:'Hospitality',terms:['chef','cook','barista','waiter','bartender','kitchen','hospitality']},
 retail:{label:'Retail & customer service',terms:['retail','sales assistant','customer service','store manager','call centre']},
 office:{label:'Administration & office',terms:['administration','receptionist','office manager','executive assistant','data entry']},
 finance:{label:'Accounting & finance',terms:['accountant','bookkeeper','payroll','finance','accounts','auditor']},
 education:{label:'Education & childcare',terms:['teacher','educator','childcare','tutor','teacher aide','early childhood']},
 community:{label:'Community services',terms:['social worker','case manager','youth worker','counsellor','community']},
};
const words=(s:string)=>s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
const phrase=(s:string)=>{const w=words(s);return w.length>1?`(${w.join(' <-> ')})`:w[0]??'';};
const group=(alternatives:string[])=>{const parts=[...new Set(alternatives.map(phrase).filter(Boolean))];return parts.length>1?`(${parts.join(' | ')})`:parts[0]??'';};
// Free text uses websearch syntax when the person typed operators (quotes, OR, -word); otherwise synonym groups joined by AND.
export function buildQuery(q:string,sector?:string):{text:string;mode:'websearch'|'tsquery'}|null{
 const trimmed=q.trim().slice(0,200),sectorTerms=sector&&SECTORS[sector]?SECTORS[sector].terms:null;
 if(trimmed&&/["]|\bor\b|(^|\s)-\w/i.test(trimmed)&&!sectorTerms)return {text:trimmed,mode:'websearch'};
 const tokens=words(trimmed),groups:string[]=[];
 for(let i=0;i<tokens.length;){
  let matched=0,alternatives:string[]=[];
  for(const set of SYNONYMS)for(const term of set){const w=words(term);if(w.length>matched&&w.every((x,k)=>tokens[i+k]===x)){matched=w.length;alternatives=set;}}
  if(matched){groups.push(group(alternatives));i+=matched;}else{groups.push(tokens[i]);i++;}
 }
 if(sectorTerms)groups.push(group(sectorTerms));
 const text=groups.filter(Boolean).slice(0,12).join(' & ');
 return text?{text,mode:'tsquery'}:null;
}
const TYPES=['Full-time','Part-time','Casual','Contract','Temporary','Internship'];
export type SearchFilters={q:string;location:string;company:string;arrangement:string;type:string;sort:'relevance'|'newest'|'salary'|'distance';page:number;posted:number|null;near:string;radius:number;sector:string};
export function parseFilters(params:URLSearchParams):SearchFilters{
 const read=(key:string,max=120)=>(params.get(key)||'').trim().slice(0,max);
 const arrangement=read('arrangement'),type=read('type'),sector=read('sector'),near=read('near');
 const posted=Number(read('posted',4)),radius=Number(read('radius',4)),raw=Number(read('page',8)||1);
 const sortRaw=read('sort');
 const q=read('q');
 const sort=(['relevance','newest','salary','distance'] as const).find(s=>s===sortRaw)??(near?'distance':q?'relevance':'newest');
 return {q,location:read('location'),company:read('company'),arrangement:['on_site','hybrid','remote'].includes(arrangement)?arrangement:'',type:TYPES.includes(type)?type:'',sort:sort==='distance'&&!near?'newest':sort,page:Number.isSafeInteger(raw)?Math.min(Math.max(raw,1),1000):1,posted:[1,3,7,14,30].includes(posted)?posted:null,near,radius:[5,10,25,50,100,250].includes(radius)?radius:25,sector:sector in SECTORS?sector:''};
}
