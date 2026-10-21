import test from 'node:test';
import assert from 'node:assert/strict';
import {listingBriefSchema,listingDraftSchema} from '../lib/listing-ai.ts';
import {marketRoles} from '../lib/market-guide.ts';
const valid={companyId:'00000000-0000-4000-8000-000000000001',title:'Accountant',location:'Melbourne',type:'Full-time',arrangement:'hybrid',brief:'Manage accounts and monthly financial reporting.',consent:true};
test('AI brief requires explicit consent and bounds employer inputs',()=>{
 assert.equal(listingBriefSchema.safeParse(valid).success,true);
 for(const patch of [{consent:false},{consent:undefined},{brief:'x'.repeat(6001)},{companyId:'fake'},{title:''},{location:''},{task:'publish'}])assert.equal(listingBriefSchema.safeParse({...valid,...patch}).success,false);
});
test('AI output rejects incomplete, excessive and unexpected fields',()=>{
 const draft={title:'Accountant',description:'Manage accounts and monthly financial reporting.',reviewNotes:['Confirm the work hours.']};
 assert.equal(listingDraftSchema.safeParse(draft).success,true);
 for(const patch of [{description:''},{reviewNotes:Array(9).fill('Note')},{publish:true}])assert.equal(listingDraftSchema.safeParse({...draft,...patch}).success,false);
});
test('market guides carry attributable ranges, dates and unique role IDs',()=>{
 assert.ok(marketRoles.length>=10);assert.equal(new Set(marketRoles.map(r=>r.id)).size,marketRoles.length);
 for(const r of marketRoles){assert.ok(r.minimum>0&&r.maximum>=r.minimum);assert.equal(new URL(r.source).hostname,'au.seek.com');assert.match(r.checkedAt,/^\d{4}-\d{2}-\d{2}$/);}
});
