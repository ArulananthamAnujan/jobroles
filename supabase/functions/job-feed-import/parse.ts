// Parses employer job feeds into the shape jp_import_feed accepts. Two formats:
// JSON {"jobs":[{id,title,description,type,arrangement,locations,salary:{min,max,period},expiresAt}]}
// and Indeed-style XML (<job><referencenumber/><title/><description/><city/><state/><jobtype/><salary/>...</job>),
// with optional <salary_min>/<salary_max>/<salary_period> when the salary text is not structured.
// It also reads the public job-board APIs of Greenhouse, Lever, Ashby and SmartRecruiters. Those boards are
// worldwide, so only roles in Australia are kept, and each keeps the employer's own application link.
// Pay is optional: a role with no stated pay is imported with min, max and period null.
export type FeedItem={externalId:string;title:string;description:string;type:string;arrangement:string;locations:string[];min:number|null;max:number|null;period:string|null;expiresAt?:string;applyUrl?:string;postedAt?:string};
const TYPES:[RegExp,string][]=[[/intern|graduate program/i,'Internship'],[/casual/i,'Casual'],[/part/i,'Part-time'],[/contract|fixed.?term/i,'Contract'],[/temp/i,'Temporary'],[/full|permanent/i,'Full-time']];
export const normaliseType=(s:string)=>TYPES.find(([r])=>r.test(s))?.[1]??null;
export const normaliseArrangement=(s:string)=>/remote|work from home|wfh|anywhere/i.test(s)?'remote':/hybrid|flexible/i.test(s)?'hybrid':'on_site';
const PERIODS:[RegExp,string][]=[[/hour|hr\b|hourly|p\.?h\b/i,'hour'],[/day|daily/i,'day'],[/month/i,'month'],[/year|annum|annual|p\.?a\b|yearly|salary/i,'year']];
export function normalisePeriod(s:string){return PERIODS.find(([r])=>r.test(s))?.[1]??null;}
// "$90,000 - $100,000 per year", "$35–$40 an hour", "90k-110k + super", "$120,000"
export function parseSalary(text:string){
 const amounts=[...text.replace(/,/g,'').matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(k)?\b/gi)].map(m=>Number(m[1])*(m[2]?1000:1)).filter(n=>n>0&&n<10000000);
 if(!amounts.length)return null;
 const [min,max]=amounts.length>1?[amounts[0],amounts[1]]:[amounts[0],amounts[0]];
 const period=normalisePeriod(text)??(min>=1000?'year':'hour');
 return min<=max?{min,max,period}:null;
}
const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const decode=(s:string)=>s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi,(m,e:string)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):ENTITIES[e.toLowerCase()]??m);
// Feeds often carry HTML descriptions; keep paragraphs and list items as lines and drop every tag.
export function htmlToText(html:string){
 return decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi,'').replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi,'\n').replace(/<li[^>]*>/gi,'• ').replace(/<[^>]+>/g,'')).replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n+/g,'\n\n').trim();
}
// Pay written in the advert itself, e.g. "$95,000 - $110,000 + super" or "$38 to $42 per hour". Deliberately strict:
// it needs a two-sided dollar range, no foreign-currency marker nearby, and figures in a believable band.
export function salaryFromText(text:string){
 const amount='(\\d{1,3}(?:,\\d{3})+|\\d{2,3}(?:\\.\\d)?k|\\d{2,3}(?:\\.\\d{2})?)';
 for(const m of text.matchAll(new RegExp(`(?<![A-Za-z£€])\\$\\s?${amount}\\s*(?:-|–|—|to)\\s*\\$?\\s?${amount}(?![\\d,])`,'gi'))){
  const around=text.slice(Math.max(0,m.index-80),m.index+m[0].length+80);
  if(/US\$|USD|NZD|NZ\$|SGD|GBP|CAD|EUR|HKD/i.test(around))continue;
  const num=(v:string)=>/k$/i.test(v)?Number(v.slice(0,-1))*1000:Number(v.replace(/,/g,''));
  const min=num(m[1]),max=num(m[2]);if(!(min>0)||max<min||max>min*3)continue;
  const after=text.slice(m.index+m[0].length,m.index+m[0].length+40);
  if(/^\s*(m\b|mn\b|bn\b|million|billion)/i.test(after)||!/salary|remuneration|\bpay\b|package|per hour|per annum|\bp\.?a\b|\bp\.?h\b|super|hourly|\brate\b|annual|\bbase\b|\bOTE\b|per day|\bwage/i.test(around))continue;
  const period=min>=20000?'year':/day|daily/i.test(after)?'day':min<1000?'hour':null;
  if(period==='year'&&max<=600000||period==='hour'&&min>=18&&max<=300||period==='day'&&min>=120&&max<=3000)return {min,max,period};
 }
 return null;
}
const AU_CITIES:Record<string,string>={sydney:'NSW',melbourne:'VIC',brisbane:'QLD',perth:'WA',adelaide:'SA',canberra:'ACT',hobart:'TAS',darwin:'NT','gold coast':'QLD',newcastle:'NSW',wollongong:'NSW',geelong:'VIC',cairns:'QLD',townsville:'QLD','sunshine coast':'QLD',parramatta:'NSW',ballarat:'VIC',bendigo:'VIC',launceston:'TAS',toowoomba:'QLD'};
const AU_STATES:Record<string,string>={'new south wales':'NSW',victoria:'VIC',queensland:'QLD','western australia':'WA','south australia':'SA',tasmania:'TAS','australian capital territory':'ACT','northern territory':'NT'};
// Returns a tidy Australian place label ("Melbourne VIC"), "Australia" for country-wide or remote roles, or null when the place is elsewhere.
export function australianPlace(label:string,country?:string){
 const raw=(label||'').replace(/\s+/g,' ').trim(),lower=raw.toLowerCase();
 if(country!==undefined&&country!==''&&!/^(au|aus|australia)$/i.test(country.trim()))return null;
 const city=Object.keys(AU_CITIES).find(c=>new RegExp(`\\b${c}\\b`).test(lower));
 const named=/\baustralia\b|\banz\b|^au\b/.test(lower)||Object.keys(AU_STATES).some(s=>s!=='victoria'&&lower.includes(s));
 const elsewhere=/united kingdom|\buk\b|england|scotland|upon tyne|canada|\bbc\b|new zealand|united states|\busa?\b|ontario/.test(lower);
 if(!(country||named||(city&&!elsewhere)))return null;
 const abbr=raw.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/)?.[1]||Object.entries(AU_STATES).find(([name])=>lower.includes(name))?.[1];
 if(city)return `${city.replace(/\b\w/g,c=>c.toUpperCase())} ${abbr||AU_CITIES[city]}`;
 const cleaned=raw.replace(/^au\s*[-–:]\s*/i,'').replace(/\baustralia\b/gi,'').replace(new RegExp(Object.keys(AU_STATES).join('|'),'gi'),'').replace(/\b(remote|anz region|anz)\b/gi,'').replace(/^[\s,–-]+|[\s,–-]+$/g,'');
 const town=cleaned.split(',').map(x=>x.trim()).filter(Boolean)[0]?.replace(/\s+/g,' ')||'';
 if(!town||/^(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)$/.test(town))return abbr?`${abbr}, Australia`:'Australia';
 return abbr&&!new RegExp(`\\b${abbr}\\b`).test(town)?`${town} ${abbr}`:town;
}
const australianPlaces=(labels:string[],country?:string)=>[...new Set(labels.map(l=>australianPlace(l,country)).filter((l):l is string=>!!l))];
// Job boards often list one role once per city. Those become a single listing with every location, and a role whose only
// place is "Australia" is treated as remote.
function tidyBoard(items:FeedItem[]){
 const merged=new Map<string,FeedItem>();
 for(const i of items){const key=`${i.title.toLowerCase()}\n${i.type}\n${i.min}-${i.max}\n${i.description}`,first=merged.get(key);
  if(first)first.locations=[...new Set([...first.locations,...i.locations])].slice(0,20);else merged.set(key,{...i});}
 return [...merged.values()].map(i=>i.arrangement==='on_site'&&i.locations.every(l=>l==='Australia')?{...i,arrangement:'remote'}:i);
}
const httpsUrl=(v:unknown)=>typeof v==='string'&&/^https:\/\/[^\s]+$/.test(v)&&v.length<=500?v:undefined;
function item(raw:{id:string;title:string;description:string;type:string;arrangement:string;locations:string[];salary:{min:number;max:number;period:string}|null;expires?:string;applyUrl?:string;posted?:unknown}):FeedItem|null{
 const type=normaliseType(raw.type);if(!type||!raw.id||!raw.title)return null;
 const locations=raw.locations.map(l=>l.trim()).filter(Boolean).slice(0,20);if(!locations.length)return null;
 const expires=raw.expires&&!Number.isNaN(Date.parse(raw.expires))?new Date(raw.expires).toISOString():undefined;
 // When the employer first advertised the role, so it is not shown as posted today on every import.
 const stamp=typeof raw.posted==='number'?raw.posted:typeof raw.posted==='string'&&raw.posted?Date.parse(raw.posted):NaN,postedAt=Number.isFinite(stamp)&&stamp>Date.UTC(2015,0,1)&&stamp<=Date.now()?new Date(stamp).toISOString():undefined;
 const description=htmlToText(raw.description).slice(0,30000);if(description.length<40)return null;
 const salary=raw.salary??salaryFromText(description),applyUrl=httpsUrl(raw.applyUrl);
 return {externalId:raw.id.slice(0,200),title:raw.title.trim().slice(0,140),description,type,arrangement:raw.arrangement,locations,min:salary?.min??null,max:salary?.max??null,period:salary?.period??null,...(expires?{expiresAt:expires}:{}),...(applyUrl?{applyUrl}:{}),...(postedAt?{postedAt}:{})};
}
export function parseJsonFeed(body:string){
 const data=JSON.parse(body) as {jobs?:unknown};if(!Array.isArray(data?.jobs))throw new Error('JSON feed must have a "jobs" array');
 let rejected=0;const items:FeedItem[]=[];
 for(const j of data.jobs.slice(0,2000) as Record<string,unknown>[]){
  const s=j.salary as {min?:unknown;max?:unknown;period?:unknown}|string|undefined;
  const salary=typeof s==='string'?parseSalary(s):s&&Number.isFinite(Number(s.min))&&Number.isFinite(Number(s.max))&&normalisePeriod(String(s.period??''))?{min:Number(s.min),max:Number(s.max),period:normalisePeriod(String(s.period))!}:null;
  const locs=Array.isArray(j.locations)?j.locations.map(String):typeof j.location==='string'?[j.location]:[];
  const parsed=item({id:String(j.id??''),title:String(j.title??''),description:String(j.description??''),type:String(j.type??j.employmentType??''),arrangement:normaliseArrangement(String(j.arrangement??j.workplaceType??'')),locations:locs,salary,expires:j.expiresAt?String(j.expiresAt):undefined,applyUrl:typeof j.applyUrl==='string'?j.applyUrl:typeof j.url==='string'?j.url:undefined,posted:j.postedAt});
  if(parsed)items.push(parsed);else rejected++;
 }
 return {items,rejected};
}
export function parseXmlFeed(body:string){
 let rejected=0;const items:FeedItem[]=[];
 for(const [,inner] of [...body.matchAll(/<job\b[^>]*>([\s\S]*?)<\/job>/gi)].slice(0,2000)){
  const f:Record<string,string>={};
  for(const [,tag,value] of inner.matchAll(/<([a-z_]+)\b[^>]*>([\s\S]*?)<\/\1>/gi))f[tag.toLowerCase()]=value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/,'$1').trim();
  const text=(k:string)=>decode(f[k]??'');
  const structured=f.salary_min&&f.salary_max?{min:Number(text('salary_min')),max:Number(text('salary_max')),period:normalisePeriod(text('salary_period')||text('salary'))??'year'}:null;
  const salary=structured&&Number.isFinite(structured.min)&&Number.isFinite(structured.max)?structured:parseSalary(text('salary'));
  const place=[text('city'),text('state'),text('postalcode')].filter(Boolean).join(' ');
  const parsed=item({id:text('referencenumber')||text('id'),title:text('title'),description:f.description?decode(f.description):'',type:text('jobtype'),arrangement:normaliseArrangement(`${text('remotetype')} ${text('jobtype')} ${text('city')}`),locations:place?[place]:[],salary,expires:text('expiration_date')||undefined,applyUrl:text('url')||undefined,posted:text('date')||undefined});
  if(parsed)items.push(parsed);else rejected++;
 }
 return {items,rejected};
}
// Feeds come from employers, so the worker refuses anything that could reach a private network.
export function safeFeedUrl(raw:string){
 let u:URL;try{u=new URL(raw);}catch{return false;}
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return false;
 const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||!h.includes('.'))return false;
 if(/^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(':'))return false;
 return true;
}
// Greenhouse job board API: https://boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true&pay_transparency=true
// Pay comes from pay_input_ranges (cents) when the employer publishes an AUD range. Roles outside Australia are left out.
export function parseGreenhouse(body:string){
 const data=JSON.parse(body) as {jobs?:Record<string,unknown>[]};if(!Array.isArray(data?.jobs))throw new Error('Greenhouse response has no "jobs" array; check the board name and add ?content=true&pay_transparency=true');
 let rejected=0;const items:FeedItem[]=[];
 for(const j of data.jobs.slice(0,2000)){
  const ranges=(j.pay_input_ranges as {min_cents?:number;max_cents?:number;currency_type?:string;title?:string;blurb?:string}[]|undefined)||[];
  const r=ranges.find(x=>(x.currency_type||'AUD').toUpperCase()==='AUD'&&Number.isFinite(x.min_cents)&&Number.isFinite(x.max_cents));
  const min=r?Number(r.min_cents)/100:0,max=r?Number(r.max_cents)/100:0;
  const meta=(j.metadata as {name?:string;value?:unknown}[]|null)||[];
  const typeMeta=meta.find(m=>/employment|job type|work type/i.test(m.name||''))?.value;
  const rawLoc=String((j.location as {name?:string}|undefined)?.name||'');
  const places=australianPlaces([rawLoc,...((j.offices as {name?:string;location?:string}[]|undefined)||[]).map(o=>`${o.name||''} ${o.location||''}`)]);
  if(!places.length)continue;
  const loc=rawLoc;
  const parsed=item({id:String(j.id??''),title:String(j.title??''),description:decode(String(j.content??'')),type:String(Array.isArray(typeMeta)?typeMeta[0]:typeMeta??'Full-time'),arrangement:normaliseArrangement(`${loc} ${JSON.stringify(meta)}`),locations:places,salary:r&&min<=max&&max>0?{min,max,period:normalisePeriod(`${r.title||''} ${r.blurb||''}`)??(min>=1000?'year':'hour')}:null,applyUrl:String(j.absolute_url||''),posted:j.first_published||j.updated_at});
  if(parsed)items.push(parsed);else rejected++;
 }
 return {items:tidyBoard(items),rejected};
}
// Lever postings API: https://api.lever.co/v0/postings/<company>?mode=json
export function parseLever(body:string){
 const data=JSON.parse(body) as Record<string,unknown>[];if(!Array.isArray(data))throw new Error('Lever response is not a list of postings; check the company name and add ?mode=json');
 let rejected=0;const items:FeedItem[]=[];
 const intervals:Record<string,string>={'per-year-salary':'year','per-month-salary':'month','per-day-wage':'day','per-hour-wage':'hour'};
 for(const j of data.slice(0,2000)){
  const s=j.salaryRange as {min?:number;max?:number;currency?:string;interval?:string}|undefined;
  const salary=s&&(s.currency||'AUD').toUpperCase()==='AUD'&&Number.isFinite(s.min)&&Number.isFinite(s.max)&&intervals[s.interval||'']?{min:Number(s.min),max:Number(s.max),period:intervals[s.interval!]}:null;
  const cat=(j.categories||{}) as {commitment?:string;location?:string;allLocations?:string[]};
  const lists=((j.lists||[]) as {text?:string;content?:string}[]).map(l=>`<h3>${l.text||''}</h3><ul>${l.content||''}</ul>`).join('');
  const workplace=String(j.workplaceType||'');
  const places=australianPlaces(cat.allLocations?.length?cat.allLocations:cat.location?[cat.location]:[],typeof j.country==='string'?j.country:undefined);
  if(!places.length)continue;
  const parsed=item({id:String(j.id??''),title:String(j.text??''),description:`${String(j.description??j.descriptionPlain??'')}${lists}${String(j.additional??'')}`,type:cat.commitment||'Full-time',arrangement:workplace==='remote'?'remote':workplace==='hybrid'?'hybrid':normaliseArrangement(cat.location||''),locations:places,salary,applyUrl:String(j.hostedUrl||j.applyUrl||''),posted:j.createdAt});
  if(parsed)items.push(parsed);else rejected++;
 }
 return {items:tidyBoard(items),rejected};
}
// Ashby job board API: https://api.ashbyhq.com/posting-api/job-board/<board>?includeCompensation=true
export function parseAshby(body:string){
 const data=JSON.parse(body) as {jobs?:Record<string,unknown>[]};if(!Array.isArray(data?.jobs))throw new Error('Ashby response has no "jobs" list; check the board name');
 type Addr={postalAddress?:{addressLocality?:string;addressRegion?:string;addressCountry?:string}};
 const place=(label:unknown,a?:Addr)=>{const p=a?.postalAddress;return p?.addressCountry?australianPlace([p.addressLocality,p.addressRegion].filter(Boolean).join(', ')||String(label||''),p.addressCountry):australianPlace(String(label||''));};
 const kinds:Record<string,string>={FullTime:'Full-time',PartTime:'Part-time',Intern:'Internship',Contract:'Contract',Temporary:'Temporary'};
 const intervals:[RegExp,string][]=[[/YEAR/i,'year'],[/MONTH/i,'month'],[/DAY/i,'day'],[/HOUR/i,'hour']];
 let rejected=0;const items:FeedItem[]=[];
 for(const j of data.jobs.slice(0,5000)){
  if(j.isListed===false)continue;
  const places=[...new Set([place(j.location,j.address as Addr),...((j.secondaryLocations as {location?:string;address?:Addr}[]|undefined)||[]).map(x=>place(x.location,x.address))].filter((x):x is string=>!!x))];
  if(!places.length)continue;
  const pay=((j.compensation as {summaryComponents?:{compensationType?:string;interval?:string;currencyCode?:string;minValue?:number|null;maxValue?:number|null}[]}|undefined)?.summaryComponents||[]).find(c=>c.compensationType==='Salary'&&(c.currencyCode||'AUD')==='AUD'&&Number.isFinite(c.minValue)&&Number.isFinite(c.maxValue));
  const period=pay?intervals.find(([r])=>r.test(pay.interval||''))?.[1]:undefined;
  const mode=String(j.workplaceType||'');
  const parsed=item({id:String(j.id??''),title:String(j.title??''),description:String(j.descriptionHtml??j.descriptionPlain??''),type:kinds[String(j.employmentType||'')]||'Full-time',arrangement:mode==='Remote'?'remote':mode==='Hybrid'?'hybrid':mode==='OnSite'?'on_site':j.isRemote?'remote':'on_site',locations:places,salary:pay&&period&&Number(pay.maxValue)>0?{min:Number(pay.minValue),max:Number(pay.maxValue),period}:null,applyUrl:String(j.jobUrl||j.applyUrl||''),posted:j.publishedAt});
  if(parsed)items.push(parsed);else rejected++;
 }
 return {items:tidyBoard(items),rejected};
}
// SmartRecruiters: the list (https://api.smartrecruiters.com/v1/companies/<id>/postings?country=au) has no advert text,
// so the worker fetches each posting and passes the full records here.
export function parseSmartRecruiters(postings:Record<string,unknown>[]){
 let rejected=0;const items:FeedItem[]=[];
 for(const j of postings.slice(0,2000)){
  const l=(j.location||{}) as {city?:string;region?:string;country?:string;remote?:boolean;hybrid?:boolean;fullLocation?:string};
  const place=australianPlace([l.city,l.region].filter(Boolean).join(' ')||l.fullLocation||'',l.country||'');if(!place)continue;
  const sections=((j.jobAd as {sections?:Record<string,{title?:string;text?:string}>}|undefined)?.sections)||{};
  const description=['jobDescription','qualifications','additionalInformation','companyDescription'].map(k=>sections[k]?.text?`<h3>${sections[k].title||''}</h3>${sections[k].text}`:'').join('');
  const parsed=item({id:String(j.id??''),title:String(j.name??''),description,type:String((j.typeOfEmployment as {label?:string}|undefined)?.label||'Full-time'),arrangement:l.hybrid?'hybrid':l.remote?'remote':'on_site',locations:[place],salary:null,applyUrl:String(j.postingUrl||j.applyUrl||''),posted:j.releasedDate});
  if(parsed)items.push(parsed);else rejected++;
 }
 return {items:tidyBoard(items),rejected};
}
// Turns what an employer or administrator pastes (a careers page link, an API link, or just the board name) into the
// address the importer reads, and works out which system it is. Returns null when it cannot tell.
export type SourceFormat='json'|'xml'|'greenhouse'|'lever'|'ashby'|'smartrecruiters';
export function resolveSource(input:string,format?:SourceFormat):{format:SourceFormat;url:string}|null{
 const raw=input.trim();let host='',path:string[]=[];
 try{const u=new URL(raw);host=u.hostname.toLowerCase();path=u.pathname.split('/').filter(Boolean);}catch{if(!/^[\w.-]{1,80}$/.test(raw)||!format)return null;}
 const guess:SourceFormat|undefined=host.endsWith('greenhouse.io')?'greenhouse':host.endsWith('lever.co')?'lever':host.endsWith('ashbyhq.com')?'ashby':host.endsWith('smartrecruiters.com')?'smartrecruiters':undefined;
 const kind=guess||format;if(!kind)return null;
 if(kind==='json'||kind==='xml')return host&&raw.startsWith('https://')?{format:kind,url:raw}:null;
 const skip=new Set(['v1','v0','boards','embed','job_board','postings','posting-api','job-board','companies','jobs','api']);
 const slug=host?path.find(p=>!skip.has(p.toLowerCase())&&!/^\d+$/.test(p)):raw;
 if(!slug||!/^[\w.-]{1,80}$/.test(slug))return null;
 const url={greenhouse:`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true&pay_transparency=true`,lever:`https://api.lever.co/v0/postings/${slug}?mode=json`,ashby:`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,smartrecruiters:`https://api.smartrecruiters.com/v1/companies/${slug}/postings`}[kind];
 return {format:kind,url};
}
