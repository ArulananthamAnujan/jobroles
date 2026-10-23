import test from 'node:test';
import assert from 'node:assert/strict';
import {jobPostingJsonLd,serializeJsonLd,placeFromLabel,descriptionHtml} from '../lib/job-posting.ts';
import {payStats} from '../lib/company.ts';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-LD is deeply nested; tests read it loosely.
type Loose=Record<string,any>;
const job={id:'j1',title:'Registered Nurse',description:'Line one\nline two\n\n<b>Second</b> paragraph',employment_type:'Casual',arrangement:'on_site',salary_min:38.5,salary_max:44,salary_period:'hour',currency:'AUD',published_at:'2026-10-01T00:00:00Z',expires_at:'2026-11-01T00:00:00Z',companies:{name:'Bayside Health'},job_locations:[{label:'Frankston VIC 3199'}]};
test('JobPosting carries the fields Google for Jobs requires',()=>{
 const d=jobPostingJsonLd(job,'https://jobroles.example') as Loose;
 assert.equal(d['@type'],'JobPosting');assert.equal(d.datePosted,job.published_at);assert.equal(d.validThrough,job.expires_at);
 assert.deepEqual(d.employmentType,['PART_TIME','TEMPORARY']);assert.equal(d.hiringOrganization.name,'Bayside Health');
 assert.deepEqual(d.jobLocation.address,{'@type':'PostalAddress',addressLocality:'Frankston',addressRegion:'VIC',postalCode:'3199',addressCountry:'AU'});
 assert.deepEqual(d.baseSalary.value,{'@type':'QuantitativeValue',minValue:38.5,maxValue:44,unitText:'HOUR'});
 assert.equal(d.url,'https://jobroles.example/jobs/j1');
});
test('remote roles are marked as telecommute within Australia',()=>{
 const d=jobPostingJsonLd({...job,arrangement:'remote',job_locations:[{label:'Remote, Australia'}]},'https://x') as Loose;
 assert.equal(d.jobLocationType,'TELECOMMUTE');assert.equal(d.applicantLocationRequirements.name,'Australia');assert.equal(d.jobLocation,undefined);
});
test('descriptions are escaped HTML paragraphs',()=>{assert.equal(descriptionHtml(job.description),'<p>Line one<br>line two</p><p>&lt;b&gt;Second&lt;/b&gt; paragraph</p>');});
test('JSON-LD cannot close its script tag',()=>{const s=serializeJsonLd({t:'</script><script>alert(1)</script>'});assert.ok(!s.includes('<')&&!s.includes('>'));assert.deepEqual(JSON.parse(s),{t:'</script><script>alert(1)</script>'});});
test('place parsing tolerates labels without a state',()=>{assert.deepEqual(placeFromLabel('Australia').address,{'@type':'PostalAddress',addressCountry:'AU'});});
test('company pay stats group by period with a median midpoint',()=>{
 const s=payStats([{salary_min:90000,salary_max:100000,salary_period:'year'},{salary_min:100000,salary_max:140000,salary_period:'year'},{salary_min:30,salary_max:40,salary_period:'hour'},{salary_min:null,salary_max:null,salary_period:null}]);
 assert.deepEqual(s.map(x=>[x.period,x.count,x.low,x.high,x.median]),[['year',2,90000,140000,107500],['hour',1,30,40,35]]);
});
