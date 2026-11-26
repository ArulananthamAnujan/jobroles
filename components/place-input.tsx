'use client';
import {useEffect,useId,useRef,useState} from 'react';
// The "Where" box: suggests matching Australian suburbs, cities and states in a list under the box as the person
// types. The list is the site's own (not the browser's), so it looks the same everywhere and can be used with the
// mouse, touch or the arrow keys and Enter.
export default function PlaceInput({name='near',defaultValue='',placeholder='City, suburb or state',...rest}:{name?:string;defaultValue?:string;placeholder?:string;'aria-label'?:string;className?:string}){
 const id=useId(),box=useRef<HTMLInputElement>(null),wrap=useRef<HTMLSpanElement>(null);
 const [places,P]=useState<string[]>([]),[open,O]=useState(false),[at,A]=useState(-1);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),latest=useRef('');
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 useEffect(()=>{if(!open)return;const away=(e:MouseEvent)=>{if(!wrap.current?.contains(e.target as Node))O(false);};document.addEventListener('mousedown',away);return()=>document.removeEventListener('mousedown',away);},[open]);
 function suggest(value:string){const q=value.trim();latest.current=q;A(-1);if(timer.current)clearTimeout(timer.current);if(q.length<2){P([]);O(false);return;}
  timer.current=setTimeout(()=>{fetch(`/api/places?q=${encodeURIComponent(q)}`).then(r=>r.json()).then((d:{places?:string[]})=>{if(latest.current!==q)return;const list=(d.places||[]).filter(p=>p.toLowerCase()!==q.toLowerCase());P(list);O(list.length>0);}).catch(()=>{});},150);}
 function choose(place:string){const el=box.current;if(!el)return;
  // Set the box the way typing would, so anything listening (such as the search address) hears the change.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(el,place);el.dispatchEvent(new Event('input',{bubbles:true}));
  latest.current=place;P([]);O(false);A(-1);el.focus();}
 return <span className="place-input" ref={wrap}>
  <input {...rest} ref={box} name={name} defaultValue={defaultValue} maxLength={120} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={at>=0?`${id}-${at}`:undefined}
   onChange={e=>suggest(e.target.value)} onFocus={()=>{if(places.length)O(true);}}
   onKeyDown={e=>{if(!open||!places.length)return;
    if(e.key==='ArrowDown'){e.preventDefault();A(i=>(i+1)%places.length);}
    else if(e.key==='ArrowUp'){e.preventDefault();A(i=>(i<=0?places.length:i)-1);}
    else if(e.key==='Enter'&&at>=0){e.preventDefault();choose(places[at]);}
    else if(e.key==='Escape'){O(false);A(-1);}}}/>
  {open&&<ul className="place-list" id={id} role="listbox" aria-label="Suggested places">{places.map((p,i)=><li key={p} id={`${id}-${i}`} role="option" aria-selected={i===at} className={i===at?'on':''} onMouseDown={e=>{e.preventDefault();choose(p);}} onMouseEnter={()=>A(i)}>{p}</li>)}</ul>}
 </span>;
}
