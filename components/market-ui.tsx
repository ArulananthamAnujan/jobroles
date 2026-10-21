'use client';
import Link from 'next/link';
import type {ReactNode,ComponentProps} from 'react';
import {Button} from './ui/button';
import {Card} from './ui/card';
export function Btn({children,secondary=false,...props}:ComponentProps<typeof Button>&{secondary?:boolean}){return <Button {...props} variant={secondary?'outline':'default'} className={`jp-btn ${secondary?'secondary':''} ${props.className??''}`}>{children}</Button>}
export function Panel({children,className='',...props}:ComponentProps<typeof Card>){return <Card {...props} className={`panel ${className}`}>{children}</Card>}
export function ActionLink({href,children,secondary=false,className=''}:{href:string;children:ReactNode;secondary?:boolean;className?:string}){return <Link className={`jp-btn ${secondary?'secondary':''} ${className}`} href={href}>{children}</Link>}
export function Badge({children,tone='teal'}:{children:ReactNode;tone?:string}){return <span className={`badge ${tone}`}>{children}</span>}
export function Mark({initials}:{initials:string}){return <span className="company-mark" aria-hidden="true">{initials}</span>}
const assets:Record<string,string>={pin:'bb8a2',money:'f6b25',briefcase:'2b364',bookmark:'1da88',search:'3e97c',user:'0304c',home:'23920',users:'d48b1',wallet:'ca5a0',message:'c3238',shield:'ac6d0',clock:'1a189'};
export function Icon({name}:{name:string}){return <img className="icon" src={`/assets/${assets[name]??assets.briefcase}.svg`} alt="" width="24" height="24"/>}
export function Brand(){return <Link href="/" className="brand" aria-label="JobRoles home"><img src="/assets/brand.svg" width="34" height="34" alt=""/><span>JobRoles</span></Link>}
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function Heading({title,sub,action}:{title:string;sub?:string;action?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1>{sub&&<p className="muted">{sub}</p>}</div>{action}</div>}
export function Empty({title,children}:{title:string;children:ReactNode}){return <Panel className="empty"><Icon name="search"/><h2>{title}</h2>{children}</Panel>}
export function date(value:string){return new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Australia/Melbourne'}).format(new Date(value));}
