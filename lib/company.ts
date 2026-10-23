// Summarises advertised pay ranges per pay period: the lowest minimum and highest maximum, plus the median midpoint.
type Pay={salary_min:number|null;salary_max:number|null;salary_period:string|null};
const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:n<1000?2:0}).format(n);
export function payStats(jobs:Pay[]){
 const groups=new Map<string,Pay[]>();
 for(const j of jobs)if(j.salary_min!==null&&j.salary_max!==null&&j.salary_period){const g=groups.get(j.salary_period)||[];g.push(j);groups.set(j.salary_period,g);}
 return ['year','month','day','hour'].filter(p=>groups.has(p)).map(period=>{
  const g=groups.get(period)!,mids=g.map(j=>(Number(j.salary_min)+Number(j.salary_max))/2).sort((a,b)=>a-b);
  const median=mids.length%2?mids[(mids.length-1)/2]:(mids[mids.length/2-1]+mids[mids.length/2])/2;
  const low=Math.min(...g.map(j=>Number(j.salary_min))),high=Math.max(...g.map(j=>Number(j.salary_max)));
  return {period,count:g.length,low,high,median,label:`${money(low)}–${money(high)}, median midpoint ${money(median)}`};
 });
}
// Groups advertised pay by job title and period, so a salaries table can show the range for each role.
export function payByTitle(jobs:(Pay&{title:string})[]){
 const groups=new Map<string,{title:string;period:string;low:number;high:number;count:number}>();
 for(const j of jobs){if(j.salary_min===null||j.salary_max===null||!j.salary_period)continue;const title=j.title.trim().replace(/\s+/g,' ');const key=`${title.toLowerCase()}|${j.salary_period}`;const g=groups.get(key);
  if(g){g.low=Math.min(g.low,Number(j.salary_min));g.high=Math.max(g.high,Number(j.salary_max));g.count++;}else groups.set(key,{title,period:j.salary_period,low:Number(j.salary_min),high:Number(j.salary_max),count:1});}
 return [...groups.values()].sort((a,b)=>b.count-a.count||a.title.localeCompare(b.title)).map(g=>({...g,label:g.low===g.high?money(g.low):`${money(g.low)}–${money(g.high)}`}));
}
