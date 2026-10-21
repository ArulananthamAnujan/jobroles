import test from 'node:test';
import assert from 'node:assert/strict';
import {preferenceInput} from '../lib/application-preferences.ts';
test('manual mode discards injected activation and identity fields',()=>{assert.deepEqual(preferenceInput.parse({mode:'manual',sending_enabled:true,user_id:'other'}),{mode:'manual'});});
test('automatic setup requires explicit acknowledgement, resume and matching information',()=>{assert.equal(preferenceInput.safeParse({mode:'automatic'}).success,false);});
