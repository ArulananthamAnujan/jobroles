import test from 'node:test';
import assert from 'node:assert/strict';
import {resumePdf,monthLabel} from '../lib/resume-pdf.ts';
const text=(b:Uint8Array)=>Array.from(b,c=>String.fromCharCode(c)).join('');
test('builds a valid PDF with a correct cross-reference table',()=>{
 const pdf=resumePdf({name:'Priya (Pri) Nair',headline:'Emergency nurse',location:'Frankston VIC',email:'priya@example.com',summary:'Six years in emergency – calm under pressure.',skills:['Triage','ALS'],
  experience:[{title:'Registered Nurse',company:'Monash Health',start:'2020-02',end:null,description:'Triage and resuscitation in a level 1 trauma centre.'}],education:[{qualification:'Bachelor of Nursing',institution:'Deakin University',year:2019}],licences:['AHPRA registration'],languages:['English','Tamil']});
 const s=text(pdf);assert.ok(s.startsWith('%PDF-1.4'));assert.ok(s.trimEnd().endsWith('%%EOF'));
 assert.match(s,/\(Priya \\\(Pri\\\) Nair\) Tj/,'parentheses are escaped');
 assert.ok(s.includes('\x96'),'en dash uses WinAnsi');
 const xref=Number(s.match(/startxref\n(\d+)/)![1]);assert.equal(s.slice(xref,xref+4),'xref');
 const offsets=[...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m=>Number(m[1]));
 offsets.forEach((o,i)=>assert.equal(s.slice(o,o+`${i+1} 0 obj`.length),`${i+1} 0 obj`));
});
test('long resumes flow onto more pages',()=>{
 const many=Array.from({length:20},(_,i)=>({title:`Role ${i}`,company:'Company',start:'2010-01',end:'2011-01',description:'Did a lot of useful work. '.repeat(20)}));
 const s=text(resumePdf({name:'A',experience:many}));const count=Number(s.match(/\/Count (\d+)/)![1]);assert.ok(count>=3);
 assert.equal(monthLabel('2020-02'),'Feb 2020');assert.equal(monthLabel(null),'Present');
});
