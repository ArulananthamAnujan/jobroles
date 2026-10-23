// schema.org JobPosting for Google for Jobs. Pure functions so they can be unit tested.
type Job={id:string;title:string;description:string;employment_type:string;arrangement:string;salary_min:number|null;salary_max:number|null;salary_period:string|null;currency:string;published_at:string;expires_at:string;companies:{name:string};job_locations:{label:string}[]};
const TYPES:Record<string,string[]>={'Full-time':['FULL_TIME'],'Part-time':['PART_TIME'],Casual:['PART_TIME','TEMPORARY'],Contract:['CONTRACTOR'],Temporary:['TEMPORARY'],Internship:['INTERN']};
const UNITS:Record<string,string>={hour:'HOUR',day:'DAY',month:'MONTH',year:'YEAR'};
const STATES=['VIC','NSW','QLD','WA','SA','TAS','ACT','NT'];
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function descriptionHtml(text:string){return text.trim().split(/\n{2,}/).map(p=>`<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`).join('');}
export function placeFromLabel(label:string){
 const parts=label.split(/[,\s]+/).filter(Boolean);const region=parts.find(p=>STATES.includes(p.toUpperCase()));
 const locality=parts.filter(p=>p!==region&&!/^\d{4}$/.test(p)&&!/^australia$/i.test(p)).join(' ');
 const postcode=parts.find(p=>/^\d{4}$/.test(p));
 return {'@type':'Place',address:{'@type':'PostalAddress',...(locality?{addressLocality:locality}:{}),...(region?{addressRegion:region.toUpperCase()}:{}),...(postcode?{postalCode:postcode}:{}),addressCountry:'AU'}};
}
export function jobPostingJsonLd(job:Job,origin:string){
 const remote=job.arrangement==='remote';
 const data:Record<string,unknown>={'@context':'https://schema.org','@type':'JobPosting',title:job.title,description:descriptionHtml(job.description),identifier:{'@type':'PropertyValue',name:job.companies.name,value:job.id},datePosted:job.published_at,validThrough:job.expires_at,employmentType:TYPES[job.employment_type]??['OTHER'],hiringOrganization:{'@type':'Organization',name:job.companies.name},directApply:true,url:`${origin}/jobs/${job.id}`};
 if(remote){data.jobLocationType='TELECOMMUTE';data.applicantLocationRequirements={'@type':'Country',name:'Australia'};}
 const places=job.job_locations.filter(l=>!/remote/i.test(l.label)).map(l=>placeFromLabel(l.label));
 if(places.length)data.jobLocation=places.length===1?places[0]:places;
 else if(!remote)data.jobLocation=placeFromLabel('Australia');
 if(job.salary_min!==null&&job.salary_max!==null&&job.salary_period&&UNITS[job.salary_period])data.baseSalary={'@type':'MonetaryAmount',currency:job.currency||'AUD',value:{'@type':'QuantitativeValue',minValue:Number(job.salary_min),maxValue:Number(job.salary_max),unitText:UNITS[job.salary_period]}};
 return data;
}
// Safe to place inside a <script> tag: no "</script>" or HTML comment can be formed.
export function serializeJsonLd(data:unknown){return JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');}
export function siteOrigin(){return (process.env.APP_ORIGIN||'http://localhost:3000').replace(/\/$/,'');}
export function indexingEnabled(){return process.env.SITE_INDEXING==='true';}
