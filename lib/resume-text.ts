import {inflateRawSync} from 'node:zlib';
// Reads word/document.xml out of a .docx (a zip file) and returns its text, one paragraph per line.
// Only stored and deflated entries are supported, which covers files saved by Word, Google Docs and Pages.
export function docxText(bytes:Uint8Array){
 const buf=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw new Error('Not a valid DOCX file');
 const count=buf.readUInt16LE(eocd+10);let p=buf.readUInt32LE(eocd+16);
 for(let n=0;n<count&&p+46<=buf.length;n++){
  if(buf.readUInt32LE(p)!==0x02014b50)break;
  const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
  const name=buf.toString('utf8',p+46,p+46+nameLen);
  if(name==='word/document.xml'){
   const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
   if(size>20*1024*1024)throw new Error('Document is too large');
   const xml=(method===8?inflateRawSync(data,{maxOutputLength:50*1024*1024}):data).toString('utf8');
   return xml.replace(/<w:tab\/>/g,'\t').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/\n{3,}/g,'\n\n').trim();
  }
  p+=46+nameLen+extra+comment;
 }
 throw new Error('No document text found');
}
