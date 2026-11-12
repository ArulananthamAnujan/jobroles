import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResumeDetails} from '../lib/resume-parse.ts';
const typical=`SAM SEEKER
Warehouse Supervisor
Parramatta NSW 2150 | 0400 000 000 | sam@example.com

PROFESSIONAL SUMMARY
Supervisor with six years running day shifts in distribution centres. Known for safe, well-rostered teams.

KEY SKILLS
• Forklift licence (LF)
• Rostering and scheduling

EMPLOYMENT HISTORY
Warehouse Supervisor – Acme Logistics, Parramatta NSW
March 2019 – Present
• Lead a team of twelve pickers and packers
• Cut mis-picks by a third in the first year

Storeperson | Harbour Freight | Jan 2016 - Feb 2019
• Picked and packed online orders
• Operated reach and counterbalance forklifts

EDUCATION
Certificate IV in Warehousing Operations, TAFE NSW, 2018
Higher School Certificate
Parramatta High School 2013

LICENCES
• Forklift licence (LF)
• First Aid certificate

LANGUAGES
English, Tamil (fluent)

REFEREES
Available on request`;
test('a typical resume fills the resume builder: summary, jobs, education, licences and languages',()=>{
 const r=parseResumeDetails(typical);
 assert.equal(r.name,'Sam Seeker');assert.equal(r.headline,'Warehouse Supervisor');
 assert.match(r.summary,/^Supervisor with six years running day shifts in distribution centres\. Known for safe/);
 assert.deepEqual(r.experience.map(e=>[e.title,e.company,e.location,e.start,e.end]),[['Warehouse Supervisor','Acme Logistics','Parramatta NSW','2019-03',''],['Storeperson','Harbour Freight','','2016-01','2019-02']]);
 assert.equal(r.experience[0].description,'• Lead a team of twelve pickers and packers\n• Cut mis-picks by a third in the first year');
 assert.equal(r.experience[1].description,'• Picked and packed online orders\n• Operated reach and counterbalance forklifts');
 assert.deepEqual(r.education,[{qualification:'Certificate IV in Warehousing Operations',institution:'TAFE NSW',year:'2018'},{qualification:'Higher School Certificate',institution:'Parramatta High School',year:'2013'}]);
 assert.deepEqual(r.licences,['Forklift licence (LF)','First Aid certificate']);
 assert.deepEqual(r.languages,['English','Tamil']);
});
test('title above employer above dates, and year-only dates',()=>{
 const r=parseResumeDetails(`Priya Nair\nWork Experience\nRegistered Nurse\nRoyal Hospital, Brisbane QLD\n2020 - 2023\nProvided acute care on a 28-bed medical ward and mentored graduate nurses.\n2017 to 2020 Assistant in Nursing, Sunnyside Aged Care\nEducation\nBachelor of Nursing - University of Queensland (2019)`);
 assert.deepEqual(r.experience.map(e=>[e.title,e.company,e.start,e.end]),[['Registered Nurse','Royal Hospital','2020-01','2023-01'],['Assistant in Nursing','Sunnyside Aged Care','2017-01','2020-01']]);
 assert.match(r.experience[0].description,/acute care on a 28-bed medical ward/);
 assert.deepEqual(r.education,[{qualification:'Bachelor of Nursing',institution:'University of Queensland',year:'2019'}]);
});
test('job title and dates on one line, employer below, plain description lines',()=>{
 const r=parseResumeDetails('Maya Fernando\nEXPERIENCE\nRegistered Nurse Feb 2021 – Present\nBarwon Health, Geelong VIC\nProvide acute care on a 28-bed medical ward\nMentor graduate nurses through their first year\nAssistant in Nursing Mar 2018 – Jan 2021\nSunnyside Aged Care, Geelong VIC\nSupported residents with daily living and mobility\nEDUCATION\nBachelor of Nursing\nDeakin University, 2020');
 assert.deepEqual(r.experience,[{title:'Registered Nurse',company:'Barwon Health',location:'Geelong VIC',start:'2021-02',end:'',description:'Provide acute care on a 28-bed medical ward\nMentor graduate nurses through their first year'},{title:'Assistant in Nursing',company:'Sunnyside Aged Care',location:'Geelong VIC',start:'2018-03',end:'2021-01',description:'Supported residents with daily living and mobility'}]);
 assert.deepEqual(r.education,[{qualification:'Bachelor of Nursing',institution:'Deakin University',year:'2020'}]);
});
test('unclear entries are left out, never guessed',()=>{
 const r=parseResumeDetails('Jordan Lee\nExperience\nVarious hospitality roles over the years in Melbourne.\nEducation\nSome study at night school');
 assert.deepEqual([r.experience,r.education,r.licences,r.languages,r.summary],[[],[],[],[],'']);
 assert.deepEqual(parseResumeDetails('').experience,[]);
});
