import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {parseDelimited,readXlsx,autoMap,toJob,problems,templateCsv,TEMPLATE_HEADERS} from '../lib/spreadsheet.ts';
// Builds a minimal zip (no CRC checks needed by the reader) holding the given files, deflated.
function zip(files:Record<string,string>){
 const locals:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const [name,text] of Object.entries(files)){const n=Buffer.from(name),data=deflateRawSync(Buffer.from(text));
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(8,8);l.writeUInt32LE(data.length,18);l.writeUInt16LE(n.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(8,10);c.writeUInt32LE(data.length,20);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  locals.push(l,n,data);central.push(c,n);offset+=30+n.length+data.length;}
 const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(Object.keys(files).length,8);e.writeUInt16LE(Object.keys(files).length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(offset,16);
 const b=Buffer.concat([...locals,cd,e]);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length) as ArrayBuffer;
}
test('reads CSV with quotes, commas, new lines and a byte order mark',()=>{
 assert.deepEqual(parseDelimited('﻿Title,Description\r\n"Nurse, ED","Line one\nline ""two"""\r\n\r\n'),[['Title','Description'],['Nurse, ED','Line one\nline "two"']]);
});
test('reads tab-separated text pasted from a spreadsheet and semicolon CSV',()=>{
 assert.deepEqual(parseDelimited('Title\tPay from\nCook\t30'),[['Title','Pay from'],['Cook','30']]);
 assert.deepEqual(parseDelimited('Title;Pay\nCook;30,5'),[['Title','Pay'],['Cook','30,5']]);
});
test('maps columns by heading, including common alternatives',()=>{
 const m=autoMap(['Position','Job Description','Suburb','Employment type','Remote?','Salary min','Salary max','Pay period','Notes']);
 assert.deepEqual([m.title,m.description,m.locations,m.type,m.arrangement,m.min,m.max,m.period],[0,1,2,3,4,5,6,7]);
 assert.equal(Object.values(m).includes(8),false);
 assert.equal(autoMap(TEMPLATE_HEADERS).screening,12);
});
test('normalises a row and explains what is wrong with it',()=>{
 const rows=parseDelimited(templateCsv()),map=autoMap(rows[0]),job=toJob(rows[1],map);
 assert.deepEqual([job.type,job.arrangement,job.min,job.max,job.period,job.startDate,job.sponsorship],['Full-time','on_site',92000,108000,'year','2026-12-01',false]);
 assert.deepEqual(job.benefits,['Salary packaging','Paid parental leave']);assert.deepEqual(problems(job),[]);
 const bad=toJob(['','short','','Gig','Moon','$40k','30','fortnight','yes','','31-12-2026','http://x'],autoMap(TEMPLATE_HEADERS));
 assert.equal(bad.min,40000);assert.equal(bad.sponsorship,true);
 const p=problems(bad).join(' | ');
 for(const s of ['job title','40 characters','location','Job type','Work setting','at least pay from','Pay per','DD/MM/YYYY','https://'])assert.match(p,new RegExp(s));
 assert.match(problems(toJob(['T','x'.repeat(50),'Perth','Casual','Remote','','','hour'],autoMap(TEMPLATE_HEADERS))).join(),/pay range/);
});
test('reads the first worksheet of an Excel file, with shared strings and dates',async()=>{
 const buf=zip({'xl/workbook.xml':'<workbook/>','xl/sharedStrings.xml':'<sst><si><t>Job title</t></si><si><t>Start date</t></si><si><r><t>Cook &amp; </t></r><r><t>chef</t></r></si></sst>',
  'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="C2" s="1"><v>46357</v></c></row><row r="3"/></sheetData></worksheet>'});
 assert.deepEqual(await readXlsx(buf),[['Job title','','Start date'],['Cook & chef','42','2026-12-01']]);
 await assert.rejects(()=>readXlsx(new ArrayBuffer(40)),/not an Excel/);
});
test('flags rows that repeat an open job or an earlier row',async()=>{
 const {duplicates,jobKeys}=await import('../lib/spreadsheet.ts');
 const open=new Set(jobKeys('Registered Nurse',['Frankston VIC']));
 assert.deepEqual(duplicates([{title:'registered nurse!',locations:['frankston vic']},{title:'Cook',locations:['Perth']},{title:'COOK',locations:['Fremantle','perth']},{title:'Cook',locations:['Darwin']}],open),['open',null,'file',null]);
});
