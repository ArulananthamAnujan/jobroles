// Asks the billing function whether Stripe is connected. Kept apart from the route file, which may only export handlers.
// Whether employers can pay for advertising right now: true, false, or null when it cannot be told (for example an
// older billing function). The answer is the same for everyone, so it is kept for a minute.
let kept:{at:number;value:{credit:boolean|null;sponsor:boolean|null}}|null=null;
export async function billingStatus(token:string){
 if(kept&&Date.now()-kept.at<60_000)return kept.value;
 let value:{credit:boolean|null;sponsor:boolean|null}={credit:null,sponsor:null};
 try{const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/billing/status`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(6000)});
  const d=await r.json().catch(()=>({})) as {credit?:unknown;sponsor?:unknown};
  if(r.ok&&typeof d.credit==='boolean'&&typeof d.sponsor==='boolean')value={credit:d.credit,sponsor:d.sponsor};
  // The function is not installed at all: nobody can pay.
  else if(r.status===404)value={credit:false,sponsor:false};
 }catch{}
 if(value.credit!==null)kept={at:Date.now(),value};
 return value;
}
