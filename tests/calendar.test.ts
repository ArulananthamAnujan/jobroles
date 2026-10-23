import test from 'node:test';
import assert from 'node:assert/strict';
import {interviewIcs,isVideoInterview} from '../lib/calendar.ts';
test('interview calendar files use UTC times and escape text',()=>{
 const ics=interviewIcs({id:'i1',startsAt:'2026-11-03T23:30:00Z',format:'Video call; link sent, by email\nBring ID',cancelled:false,title:'Interview: Registered Nurse at Bayside',url:'https://jobroles.example/account/applications/a1'},new Date('2026-10-23T00:00:00Z'));
 assert.match(ics,/DTSTART:20261103T233000Z\r\nDTEND:20261104T003000Z/);assert.match(ics,/DESCRIPTION:Video call\; link sent\\, by email\\nBring ID/);assert.match(ics,/STATUS:CONFIRMED/);
 assert.ok(ics.split('\r\n').every(l=>new TextEncoder().encode(l).length<=75));assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
test('cancelled interviews are marked cancelled',()=>{assert.match(interviewIcs({id:'i',startsAt:'2026-11-03T23:30:00Z',format:'x',cancelled:true,title:'t',url:'u'}),/STATUS:CANCELLED/);});
test('confirmed interviews remind a day and an hour before',()=>{const ics=interviewIcs({id:'i',startsAt:'2026-11-03T23:30:00Z',format:'x',cancelled:false,title:'t',url:'u'});assert.match(ics,/TRIGGER:-P1D/);assert.match(ics,/TRIGGER:-PT1H/);});
test('JobRoles video interviews are recognised by their format',()=>{
 assert.equal(isVideoInterview('JobRoles video call'),true);assert.equal(isVideoInterview(' jobroles Video'),true);assert.equal(isVideoInterview('Video call, link to follow'),false);
});
