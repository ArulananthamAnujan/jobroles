// Where the browser keeps a team invitation's secret while the person signs in or creates an account. It is kept
// for 7 days (as long as an invitation lasts) so that confirming an email in another tab does not lose it. The
// secret only works for the invited email address, and only once.
const KEY='jr.invite',WEEK=7*24*3600*1000;
export function saveInvite(token:string){try{localStorage.setItem(KEY,JSON.stringify({token,at:Date.now()}));}catch{}}
export function pendingInvite(now=Date.now()):string{
 try{const v=JSON.parse(localStorage.getItem(KEY)||'null') as {token?:unknown;at?:unknown}|null;
  if(v&&typeof v.token==='string'&&/^[0-9a-f]{64}$/.test(v.token)&&typeof v.at==='number'&&now-v.at<WEEK)return v.token;
  if(v)localStorage.removeItem(KEY);}catch{}
 return '';
}
export function forgetInvite(){try{localStorage.removeItem(KEY);}catch{}}
