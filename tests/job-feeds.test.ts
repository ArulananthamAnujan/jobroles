import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJsonFeed,parseXmlFeed,parseSalary,safeFeedUrl,htmlToText,normaliseType,parseAshby,resolveSource,salaryFromText,australianPlace} from '../supabase/functions/job-feed-import/parse.ts';
import {fetchFeed,makeFeedWorker,collectSmartRecruiters} from '../supabase/functions/job-feed-import/handler.ts';
const desc='<p>Join our <b>emergency</b> team.</p><ul><li>Clear rosters</li><li>Mentoring &amp; training</li></ul>';
test('salary text in common Australian formats',()=>{
 assert.deepEqual(parseSalary('$90,000 - $100,000 per annum + super'),{min:90000,max:100000,period:'year'});
 assert.deepEqual(parseSalary('$35–$40 an hour'),{min:35,max:40,period:'hour'});
 assert.deepEqual(parseSalary('90k-110k'),{min:90000,max:110000,period:'year'});
 assert.equal(parseSalary('Competitive'),null);assert.equal(parseSalary('$100 - $50 per hour'),null);
});
test('job types and HTML descriptions are normalised',()=>{assert.equal(normaliseType('Permanent Full Time'),'Full-time');assert.equal(normaliseType('Casual / Vacation'),'Casual');assert.equal(normaliseType('volunteer'),null);assert.equal(htmlToText(desc),'Join our emergency team.\n• Clear rosters\n• Mentoring & training');});
test('JSON feeds map fields and keep roles without pay, with no pay recorded',()=>{
 const {items,rejected}=parseJsonFeed(JSON.stringify({jobs:[{id:'R1',title:'Registered Nurse',description:desc,type:'Full time',arrangement:'Hybrid',locations:['Frankston VIC'],salary:{min:92000,max:108000,period:'annual'}},{id:'R2',title:'No pay',description:desc,type:'Casual',locations:['Perth WA'],salary:'Competitive'}]}));
 assert.equal(rejected,0);assert.deepEqual([items[1].externalId,items[1].min,items[1].max,items[1].period],['R2',null,null,null]);assert.deepEqual(items[0],{externalId:'R1',title:'Registered Nurse',description:'Join our emergency team.\n• Clear rosters\n• Mentoring & training',type:'Full-time',arrangement:'hybrid',locations:['Frankston VIC'],min:92000,max:108000,period:'year'});
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
import {parseGreenhouse,parseLever} from '../supabase/functions/job-feed-import/parse.ts';
test('Greenhouse boards map pay ranges from cents and decode HTML content',()=>{
 const body=JSON.stringify({jobs:[{id:4012,title:'Clinical Nurse Specialist',location:{name:'Geelong VIC'},content:'&lt;p&gt;Lead the ward team.&lt;/p&gt;&lt;p&gt;Support graduate nurses every day.&lt;/p&gt;',metadata:[{name:'Employment Type',value:'Part-time'}],pay_input_ranges:[{min_cents:5200,max_cents:6100,currency_type:'AUD',title:'Hourly rate'}]},{id:4013,title:'No pay',location:{name:'Perth WA'},content:'&lt;p&gt;Long enough description for a real role here.&lt;/p&gt;',pay_input_ranges:[]}]});
 const {items,rejected}=parseGreenhouse(body);
 assert.equal(rejected,0);assert.deepEqual([items[1].externalId,items[1].min,items[1].locations],['4013',null,['Perth WA']]);assert.deepEqual(items[0],{externalId:'4012',title:'Clinical Nurse Specialist',description:'Lead the ward team.\nSupport graduate nurses every day.',type:'Part-time',arrangement:'on_site',locations:['Geelong VIC'],min:52,max:61,period:'hour'});
});
test('Lever postings map salary ranges, commitment and workplace type',()=>{
 const body=JSON.stringify([{id:'abc-1',text:'Data Engineer',categories:{commitment:'Full-time',location:'Melbourne VIC',allLocations:['Melbourne VIC','Sydney NSW']},workplaceType:'hybrid',description:'<p>Build pipelines for our analytics platform.</p>',lists:[{text:'What you will do',content:'<li>Model data</li>'}],salaryRange:{min:140000,max:160000,currency:'AUD',interval:'per-year-salary'}},{id:'abc-2',text:'USD role',categories:{commitment:'Full-time',location:'Remote'},description:'<p>Long enough description for the role in question.</p>',salaryRange:{min:1,max:2,currency:'USD',interval:'per-year-salary'}}]);
 const {items,rejected}=parseLever(body);
 // The second posting is not in Australia, so it is left out rather than counted as a faulty row.
 assert.equal(rejected,0);assert.equal(items.length,1);assert.deepEqual([items[0].externalId,items[0].type,items[0].arrangement,items[0].min,items[0].max,items[0].period],['abc-1','Full-time','hybrid',140000,160000,'year']);
 assert.deepEqual(items[0].locations,['Melbourne VIC','Sydney NSW']);assert.match(items[0].description,/What you will do\n• Model data/);
});

test('job boards are worldwide: only roles in Australia are kept, with tidy place names',()=>{
 assert.equal(australianPlace('AU - Sydney'),'Sydney NSW');assert.equal(australianPlace('Level 10, 31 Queen St, Melbourne'),'Melbourne VIC');
 assert.equal(australianPlace('Wagga Wagga NSW, Australia'),'Wagga Wagga NSW');assert.equal(australianPlace('ANZ Region'),'Australia');
 assert.equal(australianPlace('Cremorne Victoria','au'),'Cremorne VIC');
 for(const elsewhere of ['London','Perth, Scotland','Newcastle upon Tyne, UK','Victoria, BC, Canada','San Francisco'])assert.equal(australianPlace(elsewhere),null);
 assert.equal(australianPlace('Sydney','us'),null);
});
test('pay written in the advert is read only when it is clearly a salary range',()=>{
 assert.deepEqual(salaryFromText('Salary $95,000 - $110,000 + super'),{min:95000,max:110000,period:'year'});
 assert.deepEqual(salaryFromText('Pay rate: $38 to $42 per hour plus penalties'),{min:38,max:42,period:'hour'});
 for(const not of ['US$150,000 - $180,000 base salary','We raised $50 - $60 million last year','Budget of $10,000 - $900,000 annual','Call us on 0400 000 000'])assert.equal(salaryFromText(not),null);
});
test('Ashby boards keep Australian roles, published pay and the employer link',()=>{
 const job=(extra:object)=>({id:'a1',title:'Product Designer',employmentType:'FullTime',location:'AU - Melbourne',workplaceType:'Hybrid',isListed:true,address:{postalAddress:{addressLocality:'Melbourne',addressRegion:'Victoria',addressCountry:'Australia'}},secondaryLocations:[{location:'SG - Singapore',address:{postalAddress:{addressCountry:'Singapore',addressLocality:'Singapore'}}},{location:'AU - Sydney',address:{postalAddress:{addressLocality:'Sydney',addressRegion:'New South Wales',addressCountry:'Australia'}}}],jobUrl:'https://jobs.ashbyhq.com/acme/a1',descriptionHtml:'<p>Design the systems our customers rely on every day.</p>',compensation:{summaryComponents:[]},...extra});
 const {items,rejected}=parseAshby(JSON.stringify({jobs:[job({}),job({id:'a2',compensation:{summaryComponents:[{compensationType:'Salary',interval:'1 YEAR',currencyCode:'AUD',minValue:120000,maxValue:140000}]}}),job({id:'a3',location:'US - Seattle',address:{postalAddress:{addressCountry:'United States',addressLocality:'Seattle'}},secondaryLocations:[]}),job({id:'a4',isListed:false})]}));
 assert.equal(rejected,0);assert.equal(items.length,2);
 assert.deepEqual(items[0],{externalId:'a1',title:'Product Designer',description:'Design the systems our customers rely on every day.',type:'Full-time',arrangement:'hybrid',locations:['Melbourne VIC','Sydney NSW'],min:null,max:null,period:null,applyUrl:'https://jobs.ashbyhq.com/acme/a1'});
 assert.deepEqual([items[1].min,items[1].max,items[1].period],[120000,140000,'year']);
});
test('SmartRecruiters postings are read one by one and joined into a full advert',async()=>{
 const detail=(id:string,country:string)=>({id,name:'Store Manager',location:{city:'Cremorne',region:'Victoria',country,hybrid:true},typeOfEmployment:{label:'Part-time'},postingUrl:`https://jobs.smartrecruiters.com/Acme/${id}`,jobAd:{sections:{jobDescription:{title:'The role',text:'<p>Run a busy store with a team of twelve.</p>'},qualifications:{title:'You',text:'<ul><li>Retail leadership</li></ul>'}}}});
 const asked:string[]=[];
 const send=(async(url:string)=>{asked.push(url);return url.includes('?')?Response.json({totalFound:2,content:[{id:'11'},{id:'12'}]}):Response.json(detail(url.split('/').pop()!,url.endsWith('12')?'nz':'au'));}) as typeof fetch;
 const {items}=await collectSmartRecruiters('https://api.smartrecruiters.com/v1/companies/Acme/postings',send);
 assert.equal(asked[0],'https://api.smartrecruiters.com/v1/companies/Acme/postings?country=au&limit=100&offset=0');
 assert.deepEqual(items,[{externalId:'11',title:'Store Manager',description:'The role\nRun a busy store with a team of twelve.\nYou\n• Retail leadership',type:'Part-time',arrangement:'hybrid',locations:['Cremorne VIC'],min:null,max:null,period:null,applyUrl:'https://jobs.smartrecruiters.com/Acme/11'}]);
});
test('a pasted careers link is turned into the address the importer reads',()=>{
 assert.deepEqual(resolveSource('https://job-boards.greenhouse.io/cultureamp'),{format:'greenhouse',url:'https://boards-api.greenhouse.io/v1/boards/cultureamp/jobs?content=true&pay_transparency=true'});
 assert.deepEqual(resolveSource('https://boards.greenhouse.io/buildkite/jobs/5419114008'),{format:'greenhouse',url:'https://boards-api.greenhouse.io/v1/boards/buildkite/jobs?content=true&pay_transparency=true'});
 assert.deepEqual(resolveSource('https://jobs.lever.co/acme/'),{format:'lever',url:'https://api.lever.co/v0/postings/acme?mode=json'});
 assert.deepEqual(resolveSource('https://jobs.ashbyhq.com/airwallex'),{format:'ashby',url:'https://api.ashbyhq.com/posting-api/job-board/airwallex?includeCompensation=true'});
 assert.deepEqual(resolveSource('https://careers.smartrecruiters.com/Canva'),{format:'smartrecruiters',url:'https://api.smartrecruiters.com/v1/companies/Canva/postings'});
 assert.deepEqual(resolveSource('canva','smartrecruiters'),{format:'smartrecruiters',url:'https://api.smartrecruiters.com/v1/companies/canva/postings'});
 assert.deepEqual(resolveSource('https://acme.example/jobs.xml','xml'),{format:'xml',url:'https://acme.example/jobs.xml'});
 assert.equal(resolveSource('https://acme.example/careers'),null);assert.equal(resolveSource('acme'),null);assert.equal(resolveSource('http://acme.example/jobs.xml','xml'),null);
});
