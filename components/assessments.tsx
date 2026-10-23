'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import './career.css';
type Assessment={code:string;title:string;description:string;minutes:number};
type Attempt={id:string;code:string;completed_at:string|null;score:number|null;shared:boolean};
type Run={attempt:string;title:string;minutes:number;endsAt:string;questions:{position:number;prompt:string;options:string[]}[]};
const level=(s:number)=>s>=90?'Expert':s>=75?'Highly proficient':s>=60?'Proficient':'Familiar';
async function post<T>(body:object){const r=await fetch('/api/career',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({})) as {result:T;error?:string};if(r.status===401)throw new Error('Sign in to take assessments.');if(!r.ok)throw new Error(d.error||'Something went wrong.');return d.result;}
function useAttempts(){const [a,A]=useState<Attempt[]|null>(null),[signedIn,S]=useState(true);
 useEffect(()=>{let live=true;fetch('/api/career',{cache:'no-store'}).then(async r=>{if(!live)return;if(!r.ok){S(false);A([]);return;}const d=await r.json() as {attempts:Attempt[]};A(d.attempts);}).catch(()=>{if(live)A([]);});return()=>{live=false;};},[]);
 return {attempts:a,signedIn,setAttempts:A};}
const latest=(attempts:Attempt[],code:string)=>attempts.find(x=>x.code===code&&x.completed_at);
// The list of assessments with the seeker's latest result and whether employers can see it.
export function AssessmentList({items}:{items:Assessment[]}){
 const {attempts,signedIn,setAttempts}=useAttempts();const [error,E]=useState('');
 return <>{!signedIn&&<p className="notice">Sign in to take assessments and show your results to employers. <Link className="text-link" href="/job-seeker">Sign in</Link></p>}{error&&<p role="alert" className="error">{error}</p>}
  <ul className="cr-tests">{items.map(t=>{const done=attempts&&latest(attempts,t.code);return <li key={t.code} className="cr-card">
   <h2>{t.title}</h2><p>{t.description}</p><p className="muted small">8 questions · {t.minutes} minutes</p>
   {done?<><p className="cr-score"><strong>{level(done.score!)}</strong> · {done.score}%</p>
    <label className="check"><input type="checkbox" checked={done.shared} onChange={async e=>{const share=e.target.checked;E('');try{await post({action:'assessment.share',attempt:done.id,share});setAttempts(attempts!.map(x=>x.id===done.id?{...x,shared:share}:x));}catch(err){E((err as Error).message);}}}/>Show this result to employers I apply to</label></>
    :<Link className="jp-btn" href={`/assessments/${t.code}`}>Start assessment</Link>}
  </li>;})}</ul></>;
}
// Runs one timed assessment; answers are scored by the database, never in the browser.
export function AssessmentRunner({item}:{item:Assessment}){
 const [run,R]=useState<Run|null>(null),[answers,A]=useState<Record<string,number>>({}),[index,I]=useState(0),[left,L]=useState(0),[result,RS]=useState<{score:number;level:string;correct:number;total:number}|null>(null),[error,E]=useState(''),[busy,B]=useState(false);
 useEffect(()=>{if(!run||result)return;const t=setInterval(()=>L(Math.max(0,Math.round((new Date(run.endsAt).getTime()-Date.now())/1000))),1000);return()=>clearInterval(t);},[run,result]);
 async function start(){B(true);E('');try{const r=await post<Run>({action:'assessment.start',code:item.code});R(r);L(r.minutes*60);I(0);A({});}catch(e){E((e as Error).message);}finally{B(false);}}
 async function finish(){B(true);E('');try{RS(await post({action:'assessment.finish',attempt:run!.attempt,answers}));}catch(e){E((e as Error).message);}finally{B(false);}}
 if(result)return <div className="cr-card cr-result"><p className="muted">Your result</p><h2>{result.level}</h2><p className="cr-big">{result.score}%</p><p>You answered {result.correct} of {result.total} questions correctly. Employers you apply to can see your level unless you hide it.</p><div className="row"><Link className="jp-btn" href="/assessments">All assessments</Link><Link className="jp-btn secondary" href="/search">Find jobs</Link></div></div>;
 if(!run)return <div className="cr-card"><h2>Before you start</h2><ul><li>8 multiple-choice questions, {item.minutes} minutes.</li><li>You can move between questions before you submit.</li><li>You can take each assessment once every 30 days.</li></ul>{error&&<p role="alert" className="error">{error}</p>}<button className="jp-btn" disabled={busy} onClick={start}>{busy?'Starting…':'Start now'}</button></div>;
 const q=run.questions[index],answered=Object.keys(answers).length,mm=Math.floor(left/60),ss=String(left%60).padStart(2,'0');
 return <div className="cr-card cr-run">
  <div className="cr-run-top"><span>Question {index+1} of {run.questions.length}</span><span className={left<60?'danger':''} role="timer" aria-live="off">{mm}:{ss} left</span></div>
  <div className="cr-progress"><span style={{width:`${answered/run.questions.length*100}%`}}/></div>
  <fieldset className="cr-question"><legend>{q.prompt}</legend>{q.options.map((o,i)=><label key={i} className={`cr-option ${answers[q.position]===i?'on':''}`}><input type="radio" name={`q${q.position}`} checked={answers[q.position]===i} onChange={()=>A({...answers,[q.position]:i})}/>{o}</label>)}</fieldset>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="row between"><button className="jp-btn secondary" disabled={index===0} onClick={()=>I(index-1)}>Previous</button>
   {index<run.questions.length-1?<button className="jp-btn" onClick={()=>I(index+1)}>Next</button>:<button className="jp-btn" disabled={busy||left===0} onClick={finish}>{busy?'Scoring…':`Submit (${answered}/${run.questions.length} answered)`}</button>}</div>
 </div>;
}
