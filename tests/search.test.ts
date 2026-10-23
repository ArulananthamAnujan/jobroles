import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQuery,parseFilters} from '../lib/search.ts';
test('abbreviations expand to their job titles',()=>{assert.deepEqual(buildQuery('RN emergency'),{text:'(rn | (registered <-> nurse)) & emergency',mode:'tsquery'});});
test('multi-word synonyms are matched before single words',()=>{assert.equal(buildQuery('aged care melbourne')?.text,'((aged <-> care) | (aged <-> care <-> worker) | (personal <-> care <-> worker)) & melbourne');});
test('operators typed by people use websearch syntax',()=>{assert.deepEqual(buildQuery('"nurse unit manager" -agency'),{text:'"nurse unit manager" -agency',mode:'websearch'});});
test('punctuation cannot inject tsquery operators',()=>{assert.equal(buildQuery("nurse)|(!x & ' :*")?.text,'nurse & x');});
test('a sector adds its keyword group',()=>{assert.equal(buildQuery('',  'care')?.text,'((aged <-> care) | (disability <-> support) | (support <-> worker) | (personal <-> care) | ndis)');assert.equal(buildQuery('   '),null);});
test('filters are validated and sort follows intent',()=>{
 assert.deepEqual(parseFilters(new URLSearchParams('q=nurse&near=Geelong&radius=50&posted=7&sector=care&page=2')),{q:'nurse',location:'',company:'',arrangement:'',type:'',sort:'distance',page:2,posted:7,near:'Geelong',radius:50,sector:'care'});
 const bad=parseFilters(new URLSearchParams('radius=9999&posted=2&sector=x&sort=distance&arrangement=moon&page=-5'));
 assert.equal(bad.radius,25);assert.equal(bad.posted,null);assert.equal(bad.sector,'');assert.equal(bad.sort,'newest');assert.equal(bad.arrangement,'');assert.equal(bad.page,1);
});
