// Builds a one-column A4 resume as a PDF using the standard Helvetica fonts, with no dependencies. Text is encoded
// as WinAnsi, which covers English and most Western European characters; anything else becomes "?".
export type ResumeData={name:string;headline?:string;location?:string;email?:string;summary?:string;skills?:string[];
 experience?:{title:string;company:string;location?:string|null;start:string;end?:string|null;description?:string|null}[];
 education?:{qualification:string;institution:string;year?:number|null}[];licences?:string[];languages?:string[]};
const W=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const B=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIN:Record<string,number>={'€':0x80,'‚':0x82,'„':0x84,'…':0x85,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'™':0x99};
function encode(text:string){const out:number[]=[];for(const ch of text.normalize('NFC')){const c=ch.codePointAt(0)!;out.push(c>=32&&c<127?c:WIN[ch]??(c>=160&&c<=255?c:63));}return out;}
function width(codes:number[],bold:boolean,size:number){const t=bold?B:W;return codes.reduce((n,c)=>n+(c>=32&&c<127?t[c-32]:556),0)*size/1000;}
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const monthLabel=(m?:string|null)=>{if(!m)return 'Present';const [y,mm]=m.split('-');return `${MONTHS[Number(mm)-1]??''} ${y}`.trim();};
export function resumePdf(r:ResumeData):Uint8Array{
 const pages:string[]=[];let ops:string[]=[];let y=0;const left=54,right=541,top=788,bottom=56;
 const newPage=()=>{if(ops.length)pages.push(ops.join('\n'));ops=[];y=top;};newPage();
 const esc=(codes:number[])=>codes.map(c=>c===40||c===41||c===92?`\\${String.fromCharCode(c)}`:String.fromCharCode(c)).join('');
 const color=(hex:string)=>{const n=parseInt(hex.slice(1),16);return `${((n>>16)&255)/255} ${((n>>8)&255)/255} ${(n&255)/255}`;};
 function line(text:string,{size=10.5,bold=false,ink='#1f2b33',gap=4,x=left,maxWidth=right-left}:{size?:number;bold?:boolean;ink?:string;gap?:number;x?:number;maxWidth?:number}={}){
  for(const para of text.split(/\r?\n/)){
   const words=para.split(/\s+/).filter(Boolean);let current:number[]=[];
   const flush=()=>{if(y-size<bottom)newPage();y-=size;ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color(ink)} rg ${x} ${y.toFixed(2)} Td (${esc(current)}) Tj ET`);y-=gap;current=[];};
   if(!words.length){y-=size*.6;continue;}
   for(const w of words){const next=current.length?[...current,32,...encode(w)]:encode(w);if(width(next,bold,size)>maxWidth&&current.length){flush();current=encode(w);}else current=next;}
   if(current.length)flush();
  }
 }
 const rightText=(text:string,size=10,ink='#5b6b75')=>{const codes=encode(text);ops.push(`BT /F1 ${size} Tf ${color(ink)} rg ${(right-width(codes,false,size)).toFixed(2)} ${(y+size+4).toFixed(2)} Td (${esc(codes)}) Tj ET`);};
 const heading=(text:string)=>{if(y-60<bottom)newPage();y-=12;line(text.toUpperCase(),{size:10.5,bold:true,ink:'#076d65',gap:4});ops.push(`${color('#cdd8de')} RG 0.8 w ${left} ${y.toFixed(2)} m ${right} ${y.toFixed(2)} l S`);y-=10;};
 line(r.name||'Your name',{size:22,bold:true,gap:6});
 if(r.headline)line(r.headline,{size:12.5,ink:'#33434d',gap:4});
 const contact=[r.location,r.email].filter(Boolean).join('  ·  ');if(contact)line(contact,{size:10,ink:'#5b6b75',gap:2});
 if(r.summary?.trim()){heading('Summary');line(r.summary.trim());}
 if(r.experience?.length){heading('Experience');for(const e of r.experience){if(y-50<bottom)newPage();line(e.title,{size:11.5,bold:true,gap:2});rightText(`${monthLabel(e.start)} – ${monthLabel(e.end)}`);
  line([e.company,e.location].filter(Boolean).join(', '),{ink:'#33434d',gap:4});if(e.description)line(e.description,{gap:3});y-=6;}}
 if(r.education?.length){heading('Education');for(const e of r.education){line(e.qualification,{size:11,bold:true,gap:2});if(e.year)rightText(String(e.year));line(e.institution,{ink:'#33434d',gap:6});}}
 if(r.skills?.length){heading('Skills');line(r.skills.join('  •  '));}
 if(r.licences?.length){heading('Licences and certifications');for(const l of r.licences)line(`•  ${l}`,{gap:3});}
 if(r.languages?.length){heading('Languages');line(r.languages.join(', '));}
 pages.push(ops.join('\n'));
 // Objects: 1 catalog, 2 pages, 3-4 fonts, then a page and content stream per page.
 const objects:string[]=[];const kids=pages.map((_,i)=>`${5+i*2} 0 R`).join(' ');
 objects.push('<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 pages.forEach((content,i)=>{objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);});
 let out='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets:number[]=[];
 objects.forEach((o,i)=>{offsets.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info << /Producer (JobRoles) /Title (${esc(encode(`${r.name} resume`))}) >> >>\nstartxref\n${xref}\n%%EOF\n`;
 const bytes=new Uint8Array(out.length);for(let i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&255;return bytes;
}
