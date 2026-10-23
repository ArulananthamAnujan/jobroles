import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJsonFeed,parseXmlFeed,parseSalary,safeFeedUrl,htmlToText,normaliseType} from '../supabase/functions/job-feed-import/parse.ts';
import {fetchFeed,makeFeedWorker} from '../supabase/functions/job-feed-import/handler.ts';
const desc='<p>Join our <b>emergency</b> team.</p><ul><li>Clear rosters</li><li>Mentoring &amp; training</li></ul>';
test('salary text in common Australian formats',()=>{
 assert.deepEqual(parseSalary('$90,000 - $100,000 per annum + super'),{min:90000,max:100000,period:'year'});
 assert.deepEqual(parseSalary('$35–$40 an hour'),{min:35,max:40,period:'hour'});
 assert.deepEqual(parseSalary('90k-110k'),{min:90000,max:110000,period:'year'});
 assert.equal(parseSalary('Competitive'),null);assert.equal(parseSalary('$100 - $50 per hour'),null);
});
test('job types and HTML descriptions are normalised',()=>{assert.equal(normaliseType('Permanent Full Time'),'Full-time');assert.equal(normaliseType('Casual / Vacation'),'Casual');assert.equal(normaliseType('volunteer'),null);assert.equal(htmlToText(desc),'Join our emergency team.\n• Clear rosters\n• Mentoring & training');});
test('JSON feeds map fields and drop roles without pay',()=>{
 const {items,rejected}=parseJsonFeed(JSON.stringify({jobs:[{id:'R1',title:'Registered Nurse',description:desc,type:'Full time',arrangement:'Hybrid',locations:['Frankston VIC'],salary:{min:92000,max:108000,period:'annual'}},{id:'R2',title:'No pay',description:desc,type:'Casual',locations:['Perth WA'],salary:'Competitive'}]}));
 assert.equal(rejected,1);assert.deepEqual(items[0],{externalId:'R1',title:'Registered Nurse',description:'Join our emergency team.\n• Clear rosters\n• Mentoring & training',type:'Full-time',arrangement:'hybrid',locations:['Frankston VIC'],min:92000,max:108000,period:'year'});
});
test('Indeed-style XML feeds with CDATA and entities',()=>{
 const xml=`<?xml version="1.0"?><source><job><title><![CDATA[Forklift Operator]]></title><referencenumber>F-9</referencenumber><description><![CDATA[${desc}]]></description><city>Brisbane</city><state>QLD</state><jobtype>casual</jobtype><salary>$33 - $37 per hour</salary><expiration_date>2026-12-01</expiration_date></job><job><title>Bad</title><referencenumber>X</referencenumber><jobtype>full-time</jobtype><city>Perth</city><salary>DOE</salary></job></source>`;
 const {items,rejected}=parseXmlFeed(xml);
 assert.equal(rejected,1);assert.equal(items[0].externalId,'F-9');assert.deepEqual(items[0].locations,['Brisbane QLD']);assert.deepEqual([items[0].min,items[0].max,items[0].period,items[0].type],[33,37,'hour','Casual']);assert.equal(items[0].expiresAt,'2026-12-01T00:00:00.000Z');
});
test('feed URLs that could reach private networks are refused',()=>{
 for(const u of ['http://ats.example/feed','https://localhost/x','https://10.0.0.1/x','https://[::1]/x','https://metadata.google.internal/x','https://user:pw@ats.example/x','https://ats.example:8443/x','https://intranet/x'])assert.equal(safeFeedUrl(u),false,u);
 assert.equal(safeFeedUrl('https://careers.bayside.example/jobs.xml'),true);
});
test('redirects to private hosts are refused',async()=>{
 const send=(async()=>new Response(null,{status:302,headers:{location:'https://169.254.169.254/latest'}})) as typeof fetch;
 await assert.rejects(()=>fetchFeed('https://ats.example/feed',send),/public https URL/);
});
test('oversized feeds are refused',async()=>{
 const send=(async()=>new Response(new Uint8Array(6*1024*1024))) as typeof fetch;
 await assert.rejects(()=>fetchFeed('https://ats.example/feed',send),/larger than 5 MB/);
});
test('the worker imports each claimed feed and records failures',async()=>{
 const calls:[string,Record<string,unknown>][]=[];
 const client=()=>({rpc:async(n:string,a:Record<string,unknown>)=>{calls.push([n,a]);if(n==='jp_claim_job_feeds')return {data:[{id:'f1',url:'https://ats.example/a.json',format:'json',lease:'l1'},{id:'f2',url:'https://ats.example/b.json',format:'json',lease:'l2'}],error:null};return {data:{created:1},error:null};}});
 const send=(async(u:string)=>u.endsWith('a.json')?Response.json({jobs:[{id:'1',title:'Chef',description:'Cook for a busy cafe in Fitzroy with a friendly team.',type:'Full-time',locations:['Fitzroy VIC'],salary:'$70,000 - $75,000'}]}):new Response('nope',{status:500})) as typeof fetch;
 const r=await makeFeedWorker(client,n=>({JOB_FEED_WORKER_SECRET:'s'} as Record<string,string>)[n],send)(new Request('https://x',{method:'POST',headers:{'x-job-feed-secret':'s'}}));
 assert.deepEqual(await r.json(),{feeds:[{feed:'f1',created:1},{feed:'f2',failed:true}]});
 assert.equal((calls[1][1].items as unknown[]).length,1);assert.deepEqual(calls[2][1],{feed:'f2',lease:'l2',items:null,problem:'Feed returned HTTP 500'});
});
