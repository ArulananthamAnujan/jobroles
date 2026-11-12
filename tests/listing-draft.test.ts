import test from 'node:test';
import assert from 'node:assert/strict';
import {builtInDraft} from '../lib/listing-draft.ts';
const base={title:'Warehouse Supervisor',location:'Parramatta NSW\nBrisbane QLD',type:'Full-time',arrangement:'on_site',brief:'Lead a team of twelve pickers and packers. Run the day shift and manage rosters; forklift licence required. Two years of supervision experience. Monday to Friday, 6am to 2pm. Free parking and paid training.'};
test('notes are sorted into sections and nothing is added',()=>{
 const d=builtInDraft({...base,task:'draft'});
 assert.equal(d.title,'Warehouse Supervisor');
 assert.match(d.description,/^About the role\nWarehouse Supervisor · Full-time · On-site · Parramatta NSW, Brisbane QLD\n\nWhat you’ll do\n• Lead a team of twelve pickers and packers\n• Run the day shift and manage rosters/);
 assert.match(d.description,/What you’ll need\n• Forklift licence required\n• Two years of supervision experience\n\nHours\n• Monday to Friday, 6am to 2pm\n\nWhat we offer\n• Free parking and paid training/);
 assert.ok(!/\$|salary|competitive/i.test(d.description));
 assert.ok(d.reviewNotes[0].includes('without AI'));
});
test('thin notes are flagged, and interview questions come from the notes',()=>{
 const thin=builtInDraft({...base,brief:'Help customers on the shop floor and keep shelves stocked.',task:'draft'});
 assert.ok(thin.reviewNotes.some(n=>/genuine requirements/.test(n)));assert.ok(thin.reviewNotes.some(n=>/hours or roster/.test(n)));
 const q=builtInDraft({...base,task:'interview'});
 const lines=q.description.split('\n');assert.ok(lines.length>=6&&lines.length<=10);
 assert.ok(lines.some(l=>/lead a team of twelve pickers and packers/.test(l)));assert.ok(lines.some(l=>/forklift licence required/.test(l)));
 assert.ok(q.reviewNotes.some(n=>/age, family plans/.test(n)));
});
test('a sentence about pay goes under pay and benefits, not requirements',()=>{
 const d=builtInDraft({...base,task:'draft',brief:'Lead a team of twelve pickers and packers. Forklift licence required. $38 an hour plus super for experienced supervisors. Free parking.'});
 assert.match(d.description,/What you’ll need\n• Forklift licence required\n\nPay and benefits\n• \$38 an hour plus super for experienced supervisors\n• Free parking/);
});
