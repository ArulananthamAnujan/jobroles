'use client';
import {useSyncExternalStore} from 'react';
// What this browser tab last knew about who is signed in. It lets pages draw the right thing straight away: the
// header does not flash "Sign in" between pages, and a visitor opening a portal is not shown a dashboard for a
// moment before the sign-in form. It is only a hint for what to draw first; the server is always asked as well.
export const SIGNED_IN_KEY='jr.signedInAs';
export function forgetSignedIn(){try{sessionStorage.removeItem(SIGNED_IN_KEY);}catch{}}
export function rememberSignedIn(email:string|null){try{sessionStorage.setItem(SIGNED_IN_KEY,email||'');}catch{}}
const read=():'in'|'out'|'unknown'=>{try{const v=sessionStorage.getItem(SIGNED_IN_KEY);return v===null?'unknown':v?'in':'out';}catch{return 'unknown';}};
const never=()=>()=>{},unknown=():'in'|'out'|'unknown'=>'unknown';
export function useSignedInHint(){return useSyncExternalStore(never,read,unknown);}
