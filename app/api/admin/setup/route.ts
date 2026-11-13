import {authenticatedClient,failure,response,ApiError,sameOrigin,jsonBody} from '@/lib/backend/server';
import {enabledProviders} from '@/lib/backend/providers';
export const dynamic='force-dynamic';
// The newest database update this version of the site expects (see supabase/migrations).
const EXPECTED='20261111000002';
type State='ok'|'attention'|'off'|'check';
type Row={group:string;title:string;state:State;detail:string;fix?:string};
type Db={version:string;cron:boolean;schedules:{name:string;schedule:string;active:boolean}[];mail:{pending:number;accepted:number;failed:number;oldestPending:string|null;latest:string|null};feeds:{active:number;neverRun:number;stale:number;failed:number;lastRun:string|null};alerts:number;scansWaiting:number;buckets:string[];directResumeRead:boolean;deletionRequests:number};
const set=(name:string)=>Boolean(process.env[name]?.trim());
const hours=(iso:string|null)=>iso?(Date.now()-new Date(iso).getTime())/3_600_000:null;
// Is a Supabase function installed? A GET is harmless: every worker answers 405 to it, and Supabase answers 404 when the function does not exist.
async function installed(name:string,token:string){
 try{const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/${name}`,{headers:{Authorization:`Bearer ${token}`,apikey:process.env.SUPABASE_PUBLISHABLE_KEY!},cache:'no-store',signal:AbortSignal.timeout(8000)});return r.status===404?false:r.status<500?true:null;}catch{return null;}
}
// A plain-language health check of everything the site depends on, for administrators.
export async function GET(request:Request){try{
 const {client}=await authenticatedClient();
 const {data:isAdmin}=await client.rpc('jp_is_admin');if(!isAdmin)throw new ApiError(403,'Administrator required.');
 const {data:{session}}=await client.auth.getSession();const token=session?.access_token||'';
 const names=['notification-mail','job-alerts','job-feed-import','account-erasure','billing','ad-click','resume-scan','resume-download'];
 const [status,providers,auth,...fn]=await Promise.all([
  client.rpc('jp_setup_status'),
  enabledProviders(),
  fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY!},cache:'no-store',signal:AbortSignal.timeout(6000)}).then(r=>r.ok?r.json():null).catch(()=>null) as Promise<{mailer_autoconfirm?:boolean;disable_signup?:boolean}|null>,
  ...names.map(n=>installed(n,token)),
 ]);
 const has=Object.fromEntries(names.map((n,i)=>[n,fn[i]])) as Record<string,boolean|null>;
 const db=(status.error?null:status.data) as Db|null;
 const rows:Row[]=[];const add=(group:string,title:string,state:State,detail:string,fix?:string)=>rows.push({group,title,state,detail,...(fix?{fix}:{})});
 const scheduled=(job:string)=>db?.schedules.find(s=>s.name===job&&s.active);
 const fnState=(n:string)=>has[n]===true?'installed':has[n]===false?'missing':'unknown';

 // --- The basics
 if(!db)add('The basics','Database updates','attention','The database is missing the latest updates, so some screens will show errors.','Run “supabase db push --linked” (or apply the files in supabase/migrations in order), then reload this page.');
 // The newest update is recognised by one of the functions it adds, which only reads the administrator's own contributions.
 else if((await client.rpc('jp_my_contributions')).error?.code==='PGRST202')add('The basics','Database updates','attention','The database is missing the newest update (20261112000001_manage_your_things), so deleting a resume, discarding a draft and similar actions will fail.','Run “supabase db push --linked”.');
 else if(db.version<EXPECTED)add('The basics','Database updates','attention',`The database is at update ${db.version}; this version of the site expects ${EXPECTED}.`,'Run “supabase db push --linked”.');
 else add('The basics','Database updates','ok','The database has every update this version of the site needs.');
 const expected=process.env.APP_ORIGIN?.replace(/\/$/,''),host=request.headers.get('x-forwarded-host')||request.headers.get('host')||'';
 if(!expected)add('The basics','Site address','attention','APP_ORIGIN is not set, so forms and emailed links cannot work.','Set APP_ORIGIN to the exact address of the site, for example https://jobroles.com.au, where the site is hosted.');
 else if(host&&new URL(expected).host!==host)add('The basics','Site address','attention',`The site is set up as ${expected} but you are visiting it at ${host}. Forms will be refused on this address.`,'Use one address everywhere and redirect the other to it, or change APP_ORIGIN to match.');
 else add('The basics','Site address','ok',`Running as ${expected}.`);
 if(db)add('The basics','File storage',db.buckets.includes('resumes')&&db.buckets.includes('company-media')?'ok':'attention',db.buckets.includes('resumes')&&db.buckets.includes('company-media')?'Storage for resumes and company images is in place.':'A storage bucket is missing, so uploads will fail.',db.buckets.includes('resumes')&&db.buckets.includes('company-media')?undefined:'Re-apply the database updates; they create the “resumes” and “company-media” buckets.');
 if(db)add('The basics','Resume downloads',db.directResumeRead||has['resume-download']?'ok':'attention',db.directResumeRead?'Applicants and the employers they applied to can download resumes.':has['resume-download']?'Working through the resume-download function.':'Nobody can download a resume yet.',db.directResumeRead||has['resume-download']?undefined:'Apply the database updates.');

 // --- Accounts
 add('Accounts and sign-in','Account emails (confirmation, password reset, sign-in link)','check',auth?.mailer_autoconfirm?'Email confirmation is switched off in Supabase, so new accounts are not asked to confirm their address.':'New accounts confirm their email address. Whether these emails come from your own address cannot be read from here.','In Supabase open Authentication > Emails > SMTP Settings and check Custom SMTP is on with sender noreply@jobroles.com.au (docs/EMAIL-SETUP.md). Then use “Forgot password?” with your own address to see who the email comes from.');
 if(auth?.disable_signup)add('Accounts and sign-in','New sign-ups','attention','Sign-ups are switched off in Supabase, so nobody can create an account.','In Supabase open Authentication > Sign In / Providers and allow new users to sign up.');
 add('Accounts and sign-in','Continue with Google, Apple or LinkedIn',providers.length?'ok':'off',providers.length?`On for: ${providers.map(p=>p==='linkedin_oidc'?'LinkedIn':p[0].toUpperCase()+p.slice(1)).join(', ')}.`:'No sign-in provider is switched on; people use email and password.',providers.length?undefined:'Optional. Follow docs/GOOGLE-SIGN-IN.md.');
 add('Accounts and sign-in','Bot protection on sign-in forms',set('TURNSTILE_SECRET_KEY')?'ok':'attention',set('TURNSTILE_SECRET_KEY')?'A security check runs on sign-up, sign-in and email requests.':'There is no security check, so a script could request many sign-in emails and use up your hourly email allowance.','Create a free Cloudflare Turnstile widget, then set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY where the site is hosted and rebuild.');

 // --- Email to users
 const mail=db?.mail,waiting=hours(mail?.oldestPending??null);
 const mailReady=has['notification-mail']===true&&scheduled('jobroles-notification-mail');
 add('Emails to users','Application emails (new applicant, messages, interviews, stage changes)',
  !db?'check':mailReady&&(waiting===null||waiting<1)?'ok':'attention',
  !db?'Needs the database updates first.':mailReady&&(waiting===null||waiting<1)?`Sending. ${mail?.accepted??0} sent so far${mail?.failed?`, ${mail.failed} failed`:''}.`:`${mail?.pending??0} ${mail?.pending===1?'email is':'emails are'} waiting to be sent${waiting!==null&&waiting>=1?`, the oldest for ${waiting<48?`${Math.round(waiting)} hours`:`${Math.round(waiting/24)} days`}`:''}. ${fnState('notification-mail')==='missing'?'The notification-mail function is not installed.':!scheduled('jobroles-notification-mail')?'There is no schedule running it.':'It is installed and scheduled but not sending; check its secrets.'}`,
  mailReady?(waiting!==null&&waiting>=1?'Check the function’s secrets (RESEND_API_KEY, NOTIFICATION_FROM, NOTIFICATION_EMAIL_ENABLED=true, NOTIFICATION_WORKER_SECRET) in docs/EMAIL-SETUP.md step 3.':undefined):'Follow docs/EMAIL-SETUP.md steps 3 and 4: deploy notification-mail, set its secrets, and run docs/schedules.sql.');
 const alertsReady=has['job-alerts']===true&&scheduled('jobroles-job-alerts');
 add('Emails to users','Job alerts and the employer daily summary',!db?'check':alertsReady?'ok':db.alerts?'attention':'off',
  !db?'Needs the database updates first.':alertsReady?`Scheduled. ${db.alerts} saved ${db.alerts===1?'search has':'searches have'} alerts on.`:`${db.alerts} saved ${db.alerts===1?'search is':'searches are'} waiting for alerts that are not being sent. ${fnState('job-alerts')==='missing'?'The job-alerts function is not installed.':'There is no schedule running it.'}`,
  alertsReady?undefined:'Deploy job-alerts, set JOB_ALERTS_ENABLED=true and its secrets, and run docs/schedules.sql (docs/EMAIL-SETUP.md).');

 // --- Jobs
 const feeds=db?.feeds,feedReady=has['job-feed-import']===true&&scheduled('jobroles-job-feed-import');
 add('Getting jobs in','Importing employers’ careers feeds',!db?'check':!feeds?.active?'off':feedReady&&!feeds.neverRun&&!feeds.stale?'ok':'attention',
  !db?'Needs the database updates first.':!feeds?.active?'No careers feeds have been added yet.':feedReady&&!feeds.neverRun&&!feeds.stale?`${feeds.active} ${feeds.active===1?'feed':'feeds'} importing${feeds.failed?`; ${feeds.failed} failed on the last run`:''}.`:`${feeds.neverRun+feeds.stale} of ${feeds.active} ${feeds.active===1?'feed has':'feeds have'} not imported recently. ${fnState('job-feed-import')==='missing'?'The job-feed-import function is not installed.':!scheduled('jobroles-job-feed-import')?'There is no schedule running it.':'Check its secret matches the schedule.'}`,
  !feeds?.active?'Add employers under Admin > Job sourcing.':feedReady&&!feeds.neverRun&&!feeds.stale?undefined:'Deploy job-feed-import, set JOB_FEED_WORKER_SECRET, and run docs/schedules.sql (docs/JOB-FEEDS.md).');
 add('Getting jobs in','“Import now” button',set('JOB_FEED_WORKER_SECRET')?'ok':'off',set('JOB_FEED_WORKER_SECRET')?'Runs an import straight away.':'Imports wait for the next scheduled pass (about hourly).','Optional. Set JOB_FEED_WORKER_SECRET where the site is hosted, with the same value as the function’s secret.');
 add('Getting jobs in','Search engines',process.env.SITE_INDEXING==='true'?'ok':'off',process.env.SITE_INDEXING==='true'?'Google and other search engines may index the site.':'Search engines are told not to index the site, so jobs will not appear in Google.','When you are ready to launch, set SITE_INDEXING=true where the site is hosted, rebuild, and submit /sitemap.xml in Google Search Console.');

 // --- Money
 add('Payments and advertising','Sponsored listings and advertising credit (Stripe)',has['billing']===true?'check':'off',has['billing']===true?'The billing function is installed. Whether Stripe is connected cannot be read from here.':'Employers cannot pay yet: the billing function is not installed.',has['billing']===true?'Open Employer portal > Sponsored jobs and choose a credit amount. Reaching Stripe’s checkout means it is connected.':'Follow docs/STRIPE-SETUP.md.');
 add('Payments and advertising','Charging for sponsored clicks',has['ad-click']===true&&set('AD_CLICK_SECRET')?'ok':'off',has['ad-click']===true&&set('AD_CLICK_SECRET')?'Clicks on sponsored jobs are recorded and charged.':'Sponsored clicks are not being counted or charged.','Deploy ad-click with --no-verify-jwt and set the same AD_CLICK_SECRET on the function and where the site is hosted.');

 // --- Safety and extras
 add('Safety and extras','Deleting accounts on request',has['account-erasure']===true?'ok':db?.deletionRequests?'attention':'off',has['account-erasure']===true?'“Erase account now” under Privacy requests works.':`${db?.deletionRequests??0} deletion ${db?.deletionRequests===1?'request is':'requests are'} waiting and cannot be completed: the account-erasure function is not installed.`,has['account-erasure']===true?undefined:'Run “supabase functions deploy account-erasure”. Privacy law expects deletion requests to be completed.');
 add('Safety and extras','Malware scanning of resumes',has['resume-scan']===true&&scheduled('jobroles-resume-scan')?'ok':'off',has['resume-scan']===true&&scheduled('jobroles-resume-scan')?`Scanning uploads.${db?.scansWaiting?` ${db.scansWaiting} waiting.`:''}`:'Resumes are checked for file type and size only, not scanned for malware.','Optional but recommended before employers download many files. See “Resume malware scanning” in docs/LAUNCH-CHECKLIST.md.');
 add('Safety and extras','AI writing help',set('OPENAI_API_KEY')?'ok':'off',set('OPENAI_API_KEY')?'People can choose AI to read resumes and draft listings.':'Resume reading and the listing assistant use the site’s built-in versions, which need no key.','Optional. Set OPENAI_API_KEY where the site is hosted to offer AI as an extra.');
 add('Safety and extras','Error reports',set('SENTRY_DSN')?'ok':'off',set('SENTRY_DSN')?'Errors are sent to Sentry.':'Errors are written to the host’s log only.','Optional. Set SENTRY_DSN to a Sentry project address.');
 // --- Employer checks
 const abnAnswer=await client.rpc('jp_abn_register_status');const abn=(abnAnswer.error?null:abnAnswer.data) as null|{connected:boolean;canReach:boolean;checked:number;failing:number;lastError:string|null;waiting:number};
 if(!abn)add('Employer checks','ABN register (checks that each employer is a real, active business)','attention','The database is missing the update that checks ABNs against the Australian Business Register.','Run “supabase db push --linked”.');
 else if(!abn.connected)add('Employer checks','ABN register (checks that each employer is a real, active business)','attention','Not connected. New companies are verified when their ABN is merely well formed, which does not prove the business exists or belongs to the person registering.','Get a free access key (GUID) from abr.business.gov.au/Tools/WebServices, then paste it into “Connect the ABN register” on this page. Steps are in docs/ABN-CHECK.md.');
 else if(!abn.canReach)add('Employer checks','ABN register (checks that each employer is a real, active business)','attention','The access key is saved, but the database cannot make web requests, so companies wait for you to verify them by hand.','In Supabase open Database > Extensions and switch on “http”.');
 else if(abn.failing>0&&!abn.checked)add('Employer checks','ABN register (checks that each employer is a real, active business)','attention',`The register is not answering${abn.lastError?` (“${abn.lastError}”)`:''}. Companies wait until it does.`,'Check the access key is the one emailed to you by the ABN Lookup service, and save it again below.');
 else add('Employer checks','ABN register (checks that each employer is a real, active business)','ok',`Connected. A company is verified only when the register says its ABN is active and registered to a matching name. ${abn.checked} checked so far${abn.waiting?`, ${abn.waiting} waiting or needing your review`:''}.`);
 return response({rows,checkedAt:new Date().toISOString(),abnRegister:abn?{connected:abn.connected}:null});
}catch(e){return failure(e);}}
// Saves (or, with an empty value, removes) the access key for the Australian Business Register.
export async function POST(request:Request){try{
 sameOrigin(request);const {client}=await authenticatedClient();
 const body=await jsonBody(request) as {abnRegisterKey?:unknown};if(typeof body?.abnRegisterKey!=='string')throw new ApiError(400,'Paste the access key.');
 const {data,error}=await client.rpc('jp_set_abn_register_key',{guid:body.abnRegisterKey});
 if(error)throw new ApiError(error.code==='42501'?403:error.code==='22023'?400:503,error.code==='42501'?'Administrator required.':error.code==='22023'?'That does not look like an ABN Lookup access key. It has the form xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.':'The key could not be saved. Apply the latest database update first.');
 return response(data);
}catch(e){return failure(e);}}
