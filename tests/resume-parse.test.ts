import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResume} from '../lib/resume-parse.ts';
test('a typical resume gives name, headline, location and skills',()=>{
 const r=parseResume(`SAM SEEKER
Warehouse Supervisor
Parramatta NSW 2150 | 0400 000 000 | sam@example.com

PROFESSIONAL SUMMARY
Supervisor with six years running day shifts in distribution centres.

KEY SKILLS
• Forklift licence (LF)
• Rostering and scheduling
• Inventory management, RF scanning, Dispatch

EMPLOYMENT HISTORY
Warehouse Supervisor – Acme Logistics, Parramatta
2019 – present
EDUCATION
Certificate IV in Warehousing Operations`);
 assert.equal(r.name,'Sam Seeker');assert.equal(r.headline,'Warehouse Supervisor');assert.equal(r.location,'Parramatta NSW');
 assert.deepEqual(r.skills.slice(0,5),['Forklift licence (LF)','Rostering and scheduling','Inventory management','RF scanning','Dispatch']);
 assert.ok(!r.skills.some(s=>/Certificate IV|Acme/.test(s)));
});
test('other common layouts',()=>{
 const a=parseResume(`Curriculum Vitae\nName: Priya O'Brien\nEmail: p@example.com\nBrisbane, Queensland\n\nExperience\nRegistered Nurse, Royal Hospital\nSkills: Wound care, Medication administration, First Aid`);
 assert.equal(a.name,"Priya O'Brien");assert.equal(a.location,'Brisbane QLD');assert.equal(a.headline,'Registered Nurse');assert.deepEqual(a.skills.slice(0,3),['Wound care','Medication administration','First Aid']);
 const b=parseResume(`Jordan Lee\njordan@example.com\nI have worked in hospitality in Melbourne for years, with an RSA and barista experience, strong customer service and cash handling.`);
 assert.equal(b.name,'Jordan Lee');assert.equal(b.location,'Melbourne VIC');assert.equal(b.headline,'');
 for(const s of ['RSA','Barista','Customer service','Cash handling'])assert.ok(b.skills.includes(s),s);
});
test('a one-line header is split into name, role and place',()=>{
 const r=parseResume('Sam Seeker - Warehouse Supervisor - Sydney NSW\nSkills: forklift, rostering, safety, inventory');
 assert.deepEqual(r,{name:'Sam Seeker',headline:'Warehouse Supervisor',location:'Sydney NSW',skills:['forklift','rostering','safety','inventory']});
});
test('nothing is invented when the text does not say it',()=>{
 assert.deepEqual(parseResume('Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor.'),{name:'',headline:'',location:'',skills:[]});
 assert.deepEqual(parseResume(''),{name:'',headline:'',location:'',skills:[]});
 const r=parseResume('Senior Project Manager\n12 Example Street\nphone 0400 000 000');assert.equal(r.name,'');
});
