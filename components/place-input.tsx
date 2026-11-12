'use client';
import {useEffect,useId,useRef,useState} from 'react';
// The "Where" box: suggests matching Australian suburbs, cities and states as the person types.
export default function PlaceInput({name='near',defaultValue='',placeholder='City, suburb or state',...rest}:{name?:string;defaultValue?:string;placeholder?:string;'aria-label'?:string;className?:string}){
 const id=useId(),[places,P]=useState<string[]>([]),timer=useRef<ReturnType<typeof setTimeout>|null>(null),latest=useRef('');
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 function suggest(value:string){const q=value.trim();latest.current=q;if(timer.current)clearTimeout(timer.current);if(q.length<2||places.includes(value)){if(q.length<2)P([]);return;}
  timer.current=setTimeout(()=>{fetch(`/api/places?q=${encodeURIComponent(q)}`).then(r=>r.json()).then((d:{places?:string[]})=>{if(latest.current===q)P(d.places||[]);}).catch(()=>{});},150);}
 return <><input {...rest} name={name} defaultValue={defaultValue} maxLength={120} placeholder={placeholder} autoComplete="off" list={id} onChange={e=>suggest(e.target.value)}/><datalist id={id}>{places.map(p=><option key={p} value={p}/>)}</datalist></>;
}
