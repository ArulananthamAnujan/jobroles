import {publicJobsClient} from '@/lib/backend/public-jobs';
import {backendConfigured} from '@/lib/backend/server';
// Suburb and city suggestions for the "Where" box. Public reference data only: nothing about the visitor is stored.
const MAJOR=['Sydney NSW','Melbourne VIC','Brisbane QLD','Perth WA','Adelaide SA','Canberra ACT','Hobart TAS','Darwin NT','Gold Coast QLD','Newcastle NSW','Wollongong NSW','Geelong VIC','Sunshine Coast QLD','Townsville QLD','Cairns QLD','Toowoomba QLD','Ballarat VIC','Bendigo VIC','Launceston TAS','Mackay QLD','Rockhampton QLD','Bunbury WA','Albury NSW','Wagga Wagga NSW','Parramatta NSW','Central Coast NSW','Mildura VIC','Shepparton VIC','Tamworth NSW','Port Macquarie NSW','Orange NSW','Dubbo NSW','Bundaberg QLD','Hervey Bay QLD','Geraldton WA','Kalgoorlie WA','Alice Springs NT','Mount Gambier SA','Frankston VIC','Dandenong VIC','Penrith NSW','Liverpool NSW','Ipswich QLD','Fremantle WA','Joondalup WA','Mandurah WA'];
const STATES=[['Victoria','VIC'],['New South Wales','NSW'],['Queensland','QLD'],['Western Australia','WA'],['South Australia','SA'],['Tasmania','TAS'],['Australian Capital Territory','ACT'],['Northern Territory','NT']];
export async function GET(request:Request){
 const q=(new URL(request.url).searchParams.get('q')||'').replace(/[^\p{L}\p{N} '\-]/gu,'').trim().slice(0,40);
 const headers={'Cache-Control':'public, max-age=3600, s-maxage=86400','X-Content-Type-Options':'nosniff'};
 if(q.length<2)return Response.json({places:[]},{headers});
 const low=q.toLowerCase(),found=[...MAJOR.filter(m=>m.toLowerCase().startsWith(low)),...STATES.filter(([name,code])=>name.toLowerCase().startsWith(low)||code.toLowerCase()===low).map(([name])=>name)];
 if(backendConfigured()){
  try{const {data}=await publicJobsClient().from('au_places').select('name,state').ilike('name',`${q.replace(/[%_]/g,'')}%`).order('name').limit(40);
   const more=(data||[]).map(p=>`${p.name} ${p.state}`).sort((a,b)=>a.length-b.length||a.localeCompare(b));for(const m of more)if(!found.includes(m))found.push(m);}catch{}
 }
 return Response.json({places:found.slice(0,8)},{headers});
}
