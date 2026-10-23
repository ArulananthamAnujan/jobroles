// Universal links for the iOS app wrapper. APPLE_APP_ID is "<Team ID>.<bundle id>".
export const dynamic='force-dynamic';
export function GET(){
 const app=process.env.APPLE_APP_ID;
 const body=app?{applinks:{details:[{appIDs:[app],components:[{'/':'/jobs/*'},{'/':'/search*'},{'/':'/companies/*'},{'/':'/job-seeker*'},{'/':'/employer*'},{'/':'/account*'},{'/':'/alerts/*'}]}]},webcredentials:{apps:[app]}}:{applinks:{details:[]}};
 return Response.json(body,{headers:{'Cache-Control':'public, max-age=3600'}});
}
