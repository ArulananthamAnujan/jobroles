'use client';
import {useState} from 'react';
// A password box with a Show / Hide button, so people can check what they typed before submitting.
export default function PasswordField({label,name,hint,autoComplete,minLength=1,describedBy}:{label:string;name:string;hint?:string;autoComplete:'current-password'|'new-password';minLength?:number;describedBy?:string}){
 const [show,S]=useState(false);
 return <label className="field"><span>{label}</span>
  <span className="pw-wrap">
   <input name={name} type={show?'text':'password'} autoComplete={autoComplete} minLength={minLength} maxLength={128} required aria-describedby={describedBy} spellCheck={false} autoCapitalize="none"/>
   <button type="button" className="pw-toggle" aria-pressed={show} aria-label={`${show?'Hide':'Show'} ${label.toLowerCase()}`} onClick={()=>S(!show)}>{show?'Hide':'Show'}</button>
  </span>
  {hint&&<small>{hint}</small>}
 </label>;
}
// One wording for the password rule everywhere it is asked for.
export const PASSWORD_HINT='At least 12 characters. A few unrelated words work well.';
export function passwordProblem(password:string,confirm:string){
 if(password.length<12)return 'Use at least 12 characters for your password.';
 if(password!==confirm)return 'The two passwords do not match. Use Show to check them.';
 return '';
}
