'use client';
import {Card} from './ui';
// Daily counts as square bars on 3–5 round gridlines, labelled weekly, with the total and the busiest day stated
// above. The last `recent` days carry the full colour so this week reads against the weeks before it.
export function Bars({title,days,recent=7,unit='applications'}:{title:string;days:{day:string;count:number}[];recent?:number;unit?:string}){
 const total=days.reduce((n,x)=>n+x.count,0),max=Math.max(...days.map(x=>x.count),0),busiest=days.find(x=>x.count===max&&max>0);
 const step=max<=4?1:max<=8?2:max<=20?5:max<=40?10:Math.ceil(max/4/10)*10,top=Math.max(step*Math.ceil((max+0.01)/step),step*2);
 const ticks=Array.from({length:top/step+1},(_,i)=>i*step);
 const W=720,H=180,L=28,B=22,T=8,bw=(W-L)/days.length;
 const y=(v:number)=>T+(H-T-B)*(1-v/top);
 const day=(s:string,o:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-AU',{timeZone:'UTC',...o}).format(new Date(`${s}T00:00:00Z`));
 return <Card title={title} action={<span className="ep-muted" style={{fontSize:13}}>{total?`${total.toLocaleString('en-AU')} in ${days.length} days · busiest ${day(busiest!.day,{weekday:'short',day:'numeric',month:'short'})} with ${max}`:`None in the last ${days.length} days`}</span>}>
  <div className="ep-chart-scroll"><svg className="ep-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, last ${days.length} days: ${total} ${unit} in total.`}>
   {ticks.map(t=><g key={t}><line className={t===0?'base':'grid'} x1={L} x2={W} y1={y(t)} y2={y(t)}/><text x={L-6} y={y(t)+4} textAnchor="end">{t}</text></g>)}
   {days.map((x,i)=><g key={x.day}><title>{`${day(x.day,{weekday:'long',day:'numeric',month:'long'})}: ${x.count}`}</title>
    <rect className="hit" x={L+i*bw} y={T} width={bw} height={H-T-B}/>
    {x.count>0&&<rect className={`bar ${i<days.length-recent?'dim':''}`} x={L+i*bw+bw*.18} y={y(x.count)} width={bw*.64} height={y(0)-y(x.count)}/>}
    {(days.length-1-i)%7===0&&<text x={L+i*bw+bw/2} y={H-4} textAnchor="middle">{i===days.length-1?'Today':day(x.day,{day:'numeric',month:'short'})}</text>}</g>)}
  </svg></div>
  {recent<days.length&&<p className="ep-muted" style={{fontSize:12,marginTop:4}}>The last {recent} days are in full colour.</p>}
 </Card>;
}
