// Parses employer job feeds into the shape jp_import_feed accepts. Two formats:
// JSON {"jobs":[{id,title,description,type,arrangement,locations,salary:{min,max,period},expiresAt}]}
// and Indeed-style XML (<job><referencenumber/><title/><description/><city/><state/><jobtype/><salary/>...</job>),
// with optional <salary_min>/<salary_max>/<salary_period> when the salary text is not structured.
export type FeedItem={externalId:string;title:string;description:string;type:string;arrangement:string;locations:string[];min:number;max:number;period:string;expiresAt?:string};
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
function item(raw:{id:string;title:string;description:string;type:string;arrangement:string;locations:string[];salary:{min:number;max:number;period:string}|null;expires?:string}):FeedItem|null{
 const type=normaliseType(raw.type);if(!type||!raw.salary||!raw.id||!raw.title)return null;
 const locations=raw.locations.map(l=>l.trim()).filter(Boolean).slice(0,20);if(!locations.length)return null;
 const expires=raw.expires&&!Number.isNaN(Date.parse(raw.expires))?new Date(raw.expires).toISOString():undefined;
 return {externalId:raw.id.slice(0,200),title:raw.title.trim().slice(0,140),description:htmlToText(raw.description).slice(0,30000),type,arrangement:raw.arrangement,locations,min:raw.salary.min,max:raw.salary.max,period:raw.salary.period,...(expires?{expiresAt:expires}:{})};
}
export function parseJsonFeed(body:string){
 const data=JSON.parse(body) as {jobs?:unknown};if(!Array.isArray(data?.jobs))throw new Error('JSON feed must have a "jobs" array');
 let rejected=0;const items:FeedItem[]=[];
 for(const j of data.jobs.slice(0,2000) as Record<string,unknown>[]){
  const s=j.salary as {min?:unknown;max?:unknown;period?:unknown}|string|undefined;
  const salary=typeof s==='string'?parseSalary(s):s&&Number.isFinite(Number(s.min))&&Number.isFinite(Number(s.max))&&normalisePeriod(String(s.period??''))?{min:Number(s.min),max:Number(s.max),period:normalisePeriod(String(s.period))!}:null;
  const locs=Array.isArray(j.locations)?j.locations.map(String):typeof j.location==='string'?[j.location]:[];
  const parsed=item({id:String(j.id??''),title:String(j.title??''),description:String(j.description??''),type:String(j.type??j.employmentType??''),arrangement:normaliseArrangement(String(j.arrangement??j.workplaceType??'')),locations:locs,salary,expires:j.expiresAt?String(j.expiresAt):undefined});
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
  const parsed=item({id:text('referencenumber')||text('id'),title:text('title'),description:f.description?decode(f.description):'',type:text('jobtype'),arrangement:normaliseArrangement(`${text('remotetype')} ${text('jobtype')} ${text('city')}`),locations:place?[place]:[],salary,expires:text('expiration_date')||undefined});
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
