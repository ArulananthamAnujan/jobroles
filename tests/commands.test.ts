import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand} from '../lib/backend/commands.ts';
const id='00000000-0000-4000-8000-000000000001';
test('command boundary rejects unknown commands and malformed IDs',()=>{assert.throws(()=>parseCommand({action:'grant.admin',payload:{}}));assert.throws(()=>parseCommand({action:'application.withdraw',payload:{id:'bad'}}));});
test('commands discard client actor and role claims',()=>{const x=parseCommand({action:'profile.save',payload:{name:'Jordan',userId:id,role:'owner'}});assert.equal('userId' in x.payload,false);assert.equal('role' in x.payload,false);});
test('submission requires a resume and valid answers',()=>{assert.throws(()=>parseCommand({action:'application.submit',payload:{jobId:id,answers:{}}}));assert.throws(()=>parseCommand({action:'application.submit',payload:{jobId:id,resumeId:id,answers:{q:'Maybe'}}}));});
test('salary bounds reject inverted ranges',()=>{assert.throws(()=>parseCommand({action:'job.save',payload:{companyId:id,title:'Nurse',description:'A meaningful nursing role with a supportive clinical team.',type:'Full-time',arrangement:'hybrid',locations:['Melbourne'],min:100000,max:80000,period:'year'}}));});
test('company verification requires matching ABN and evidence',()=>{assert.throws(()=>parseCommand({action:'company.verify',payload:{id,abnMatched:false,evidenceType:'document_review',evidenceReference:'verified reference',reason:'Reviewed'}}));});
