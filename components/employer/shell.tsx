'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {Brand} from '../market-ui';
import {Icon} from './ui';
import './portal.css';
export type NavItem={group:string;id:string;label:string;icon:string;href:string;count?:number};
// The framed-sheet shell shared by the employer portal, the job seeker portal and the admin console: one tinted
// frame holds the sidebar and the top bar, and the screen's work sits on the white sheet.
export function AppShell({nav,current,org,crumb,search,end,foot,children}:{nav:NavItem[];current:string;org?:ReactNode;crumb:ReactNode;
 search?:{placeholder:string;onSubmit:(q:string)=>void};end?:ReactNode;foot?:ReactNode;children:ReactNode}){
 const [menu,M]=useState(false),input=useRef<HTMLInputElement>(null),path=usePathname();
 useEffect(()=>{Promise.resolve().then(()=>M(false));},[path,current]);
 useEffect(()=>{if(!search)return;const k=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(e.key==='/'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)&&!t.isContentEditable){e.preventDefault();input.current?.focus();}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[search]);
 const groups=[...new Set(nav.map(n=>n.group))];
 const box=(phone:boolean)=>search&&<form role="search" className={`ep-search ${phone?'ep-side-search':''}`} onSubmit={e=>{e.preventDefault();const q=String(new FormData(e.currentTarget).get('q')||'').trim();if(q)search.onSubmit(q);}}>
  <Icon name="search"/><input ref={phone?undefined:input} name="q" type="search" placeholder={search.placeholder} aria-label={search.placeholder}/>{!phone&&<kbd aria-hidden="true">/</kbd>}</form>;
 return <div className={`ep ${menu?'menu':''}`}>
  <a className="skip-link" href="#main">Skip to content</a>
  <aside className="ep-side" aria-label="Sections">
   <Brand/>
   {org}
   {box(true)}
   <nav className="ep-nav" aria-label="Sections">{groups.map(g=><div key={g}>{g&&<p>{g}</p>}<ul>{nav.filter(n=>n.group===g).map(n=><li key={n.id}><Link href={n.href} aria-current={current===n.id?'page':undefined}><Icon name={n.icon}/>{n.label}{!!n.count&&<span className="ep-count">{n.count>99?'99+':n.count}</span>}</Link></li>)}</ul></div>)}</nav>
   {foot&&<div className="ep-side-foot">{foot}</div>}
  </aside>
  {menu&&<button className="ep-scrim" aria-label="Close menu" onClick={()=>M(false)}/>}
  <header className="ep-top">
   <button className="ep-iconbtn ep-menu-btn" aria-label="Menu" aria-expanded={menu} onClick={()=>M(!menu)}><Icon name="menu"/></button>
   <div className="ep-top-title">{crumb}</div>
   {box(false)||<span/>}
   <div className="ep-top-end">{end}</div>
  </header>
  <main className="ep-main" id="main">{children}</main>
 </div>;
}
// The account button: initials, and a menu with the account's links and sign out.
export function AccountMenu({email,links}:{email:string;links:[string,string][]}){
 const [open,O]=useState(false),ref=useRef<HTMLDivElement>(null),router=useRouter();
 useEffect(()=>{if(!open)return;const c=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))O(false);};document.addEventListener('mousedown',c);return()=>document.removeEventListener('mousedown',c);},[open]);
 const initials=email.split('@')[0].split(/[._-]+/).filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()).join('')||'?';
 return <div ref={ref} style={{display:'contents'}}><button className="ep-avatar" aria-label="Account" aria-expanded={open} onClick={()=>O(!open)}>{initials}</button>
  {open&&<div className="ep-pop" role="menu" style={{width:260}}><div className="ep-pop-head">Signed in as<br/><strong style={{color:'var(--ink)'}}>{email}</strong></div>
   {links.map(([href,label])=><Link key={href} role="menuitem" href={href} onClick={()=>O(false)}>{label}</Link>)}
   <button role="menuitem" onClick={async()=>{await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});router.replace('/');router.refresh();}}>Sign out</button></div>}</div>;
}

// The title row of a screen: one h1, a grey line stating what matters, and the actions on the right.
export function Section({title,sub,actions,children}:{title:string;sub?:string;actions?:ReactNode;children:ReactNode}){
 return <><div className="ep-head"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{actions&&<div className="ep-head-actions">{actions}</div>}</div>{children}</>;
}
