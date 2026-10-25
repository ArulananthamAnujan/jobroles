// Reads jobs from a spreadsheet for bulk import: CSV, tab-separated text pasted from Excel or Google Sheets, and
// .xlsx files (unzipped in the browser with DecompressionStream). Columns are matched by name, so employers can
// use their own headings, and every row is checked before anything is sent.
export type JobRow={title:string;description:string;locations:string[];type:string;arrangement:string;min:number|null;max:number|null;period:string;sponsorship:boolean;benefits:string[];startDate:string;externalApplyUrl:string;screening:string};
export type Field=keyof JobRow;
export const FIELDS:[Field,string,boolean][]=[['title','Job title',true],['description','Description',true],['locations','Location',true],['type','Job type',true],['arrangement','Work setting',true],['min','Pay from',true],['max','Pay to',true],['period','Pay per',true],
 ['sponsorship','Visa sponsorship',false],['benefits','Benefits',false],['startDate','Start date',false],['externalApplyUrl','Apply link',false],['screening','Screening question',false]];
const ALIASES:Record<Field,string[]>={title:['title','job title','position','role','job name','vacancy'],description:['description','job description','details','summary','about the role','ad text','body'],
 locations:['location','locations','suburb','city','where','workplace','office'],type:['type','job type','employment type','work type','contract type'],arrangement:['work setting','arrangement','remote','workplace type','on site','onsite','hybrid'],
 min:['pay from','salary from','min','minimum','salary min','pay min','min salary','rate from'],max:['pay to','salary to','max','maximum','salary max','pay max','max salary','rate to'],period:['pay per','per','period','pay period','salary period','rate per','frequency'],
 sponsorship:['visa sponsorship','sponsorship','visa'],benefits:['benefits','perks'],startDate:['start date','start','starting'],externalApplyUrl:['apply link','apply url','application url','external url','link','url'],screening:['screening question','question','screening']};
export const TYPES=['Full-time','Part-time','Casual','Contract','Temporary','Internship'];
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function parseDelimited(text:string):string[][]{
 const src=text.replace(/^﻿/,'');const first=src.split(/\r?\n/,1)[0]||'';
 const sep=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?'\t':(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<src.length;i++){const c=src[i];
  if(quoted){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"'&&cell==='')quoted=true;else if(c===sep){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 return rows.filter(r=>r.some(c=>c.trim()!==''));
}

// A minimal .xlsx reader: finds the first worksheet and its shared strings in the zip and reads cell values.
async function inflate(data:Uint8Array,method:number){if(method===0)return data;
 const stream=new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(stream).arrayBuffer());}
async function unzip(buf:ArrayBuffer){
 const b=new Uint8Array(buf),v=new DataView(buf),files=new Map<string,Uint8Array>();
 let end=b.length-22;while(end>=0&&v.getUint32(end,true)!==0x06054b50)end--;if(end<0)throw new Error('This is not an Excel (.xlsx) file.');
 let p=v.getUint32(end+16,true);const count=v.getUint16(end+10,true);
 for(let i=0;i<count;i++){const method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),nameLen=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  const name=new TextDecoder().decode(b.subarray(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  if(!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|workbook\.xml)$/.test(name))continue;
  const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);files.set(name,await inflate(b.subarray(start,start+size),method));}
 return files;
}
const unescapeXml=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/g,'&');
const colIndex=(ref:string)=>{let n=0;for(const ch of ref.replace(/\d+$/,''))n=n*26+ch.charCodeAt(0)-64;return n-1;};
// Excel stores dates as days since 1899-12-30.
const excelDate=(n:number)=>new Date(Date.UTC(1899,11,30)+n*864e5).toISOString().slice(0,10);
export async function readXlsx(buf:ArrayBuffer):Promise<string[][]>{
 const files=await unzip(buf),text=(n:string)=>files.has(n)?new TextDecoder().decode(files.get(n)):'';
 const shared=[...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>unescapeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
 const sheetName=[...files.keys()].filter(k=>k.startsWith('xl/worksheets/')).sort()[0];if(!sheetName)throw new Error('The workbook has no worksheet.');
 const rows:string[][]=[];
 for(const r of text(sheetName).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){const row:string[]=[];
  for(const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){const attrs=c[1],ref=/r="([A-Z]+\d+)"/.exec(attrs)?.[1]||'',type=/t="(\w+)"/.exec(attrs)?.[1],style=/s="(\d+)"/.exec(attrs)?.[1],body=c[2]||'';
   const raw=/<v>([\s\S]*?)<\/v>/.exec(body)?.[1]??/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1]??'';
   let val=type==='s'?shared[Number(raw)]??'':unescapeXml(raw);
   if(!type&&style&&/^\d{5}(\.\d+)?$/.test(val)&&Number(val)>20000&&Number(val)<80000)val=excelDate(Number(val));
   row[ref?colIndex(ref):row.length]=val;}
  rows.push(Array.from(row,c=>c??''));}
 return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}

// Matches each field to a column by its heading; unknown headings are left for the employer to map.
export function autoMap(headers:string[]):Partial<Record<Field,number>>{
 const map:Partial<Record<Field,number>>={};const used=new Set<number>();
 for(const [field] of FIELDS){const names=ALIASES[field].map(norm);
  const i=headers.findIndex((h,k)=>!used.has(k)&&names.includes(norm(h)));const j=i>=0?i:headers.findIndex((h,k)=>!used.has(k)&&names.some(n=>norm(h).startsWith(n)));
  if(j>=0){map[field]=j;used.add(j);}}
 return map;
}
const money=(s:string)=>{const t=s.replace(/[$,\s]|aud/gi,'').replace(/k$/i,'000');if(!t)return null;const n=Number(t);return Number.isFinite(n)?n:NaN;};
function arrangementOf(s:string){const t=norm(s);if(!t)return '';if(/remote|home|anywhere/.test(t))return 'remote';if(/hybrid|flex/.test(t))return 'hybrid';if(/site|office|onsite|in person/.test(t))return 'on_site';return s;}
function typeOf(s:string){const t=norm(s).replace(/ /g,'');const hit=TYPES.find(x=>x.toLowerCase().replace(/-/g,'')===t||t.startsWith(x.toLowerCase().slice(0,4)));return hit||s.trim();}
function periodOf(s:string){const t=norm(s);if(!t)return 'year';if(/hour|hr|ph/.test(t))return 'hour';if(/day|daily/.test(t))return 'day';if(/month/.test(t))return 'month';if(/year|annum|annual|pa/.test(t))return 'year';return s;}
function dateOf(s:string){const t=s.trim();if(!t)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:t;}
const list=(s:string,sep:RegExp)=>s.split(sep).map(x=>x.trim()).filter(Boolean);
export function toJob(cells:string[],map:Partial<Record<Field,number>>):JobRow{
 const get=(f:Field)=>{const i=map[f];return i===undefined?'':String(cells[i]??'').trim();};
 return {title:get('title'),description:get('description'),locations:list(get('locations'),/[;|\n]/),type:typeOf(get('type')),arrangement:arrangementOf(get('arrangement')),min:money(get('min')),max:money(get('max')),period:periodOf(get('period')),
  sponsorship:/^(y|yes|true|1)$/i.test(get('sponsorship')),benefits:list(get('benefits'),/[;|\n]/).slice(0,20),startDate:dateOf(get('startDate')),externalApplyUrl:get('externalApplyUrl'),screening:get('screening')};
}
// Problems that would stop a row from saving, in words an employer can fix in their spreadsheet.
export function problems(j:JobRow){
 const p:string[]=[];
 if(!j.title)p.push('Add a job title');else if(j.title.length>160)p.push('Shorten the title to 160 characters');
 if(j.description.length<40)p.push('Write a description of at least 40 characters');
 if(!j.locations.length)p.push('Add a location');
 if(!TYPES.includes(j.type))p.push(`Job type must be one of ${TYPES.join(', ')}`);
 if(!['on_site','hybrid','remote'].includes(j.arrangement))p.push('Work setting must be On-site, Hybrid or Remote');
 if(j.min===null||j.max===null)p.push('Add the pay range: JobRoles shows pay on every job');else if(Number.isNaN(j.min)||Number.isNaN(j.max))p.push('Pay must be a number');else if(j.min<=0||j.max<j.min)p.push('Pay to must be at least pay from');
 if(!['hour','day','month','year'].includes(j.period))p.push('Pay per must be hour, day, month or year');
 if(j.startDate&&!/^\d{4}-\d{2}-\d{2}$/.test(j.startDate))p.push('Write the start date as DD/MM/YYYY');
 if(j.externalApplyUrl&&!/^https:\/\//.test(j.externalApplyUrl))p.push('The apply link must start with https://');
 return p;
}
export const TEMPLATE_HEADERS=['Job title','Description','Location','Job type','Work setting','Pay from','Pay to','Pay per','Visa sponsorship','Benefits','Start date','Apply link','Screening question'];
export const TEMPLATE_EXAMPLE=['Registered Nurse, Emergency','Join our emergency department in Frankston. You will triage and care for patients across all acuity levels with a supportive team, clear rosters and paid professional development.','Frankston VIC 3199','Full-time','On-site','92000','108000','year','No','Salary packaging; Paid parental leave','01/12/2026','','Do you hold current AHPRA registration?'];
export function templateCsv(){const q=(s:string)=>/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;return [TEMPLATE_HEADERS,TEMPLATE_EXAMPLE].map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';}
