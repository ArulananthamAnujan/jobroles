import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {docxText} from '../lib/resume-text.ts';
test('DOCX text is read paragraph by paragraph',async()=>{assert.equal(docxText(new Uint8Array(await readFile('tests/fixtures/sample.docx'))),'Sam Seeker\nRegistered Nurse & Educator\nFrankston\tVIC');});
test('non-zip input is rejected',()=>{assert.throws(()=>docxText(new TextEncoder().encode('%PDF-1.7 not a docx')),/Not a valid DOCX/);});
