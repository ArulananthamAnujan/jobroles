// Digital Asset Links for the Android app (a Trusted Web Activity built with Bubblewrap from the web app).
// ANDROID_PACKAGE and ANDROID_CERT_SHA256 (comma-separated fingerprints, from Play Console > App signing).
export const dynamic='force-dynamic';
export function GET(){
 const pkg=process.env.ANDROID_PACKAGE,prints=(process.env.ANDROID_CERT_SHA256||'').split(',').map(s=>s.trim()).filter(Boolean);
 const body=pkg&&prints.length?[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:pkg,sha256_cert_fingerprints:prints}}]:[];
 return Response.json(body,{headers:{'Cache-Control':'public, max-age=3600'}});
}
