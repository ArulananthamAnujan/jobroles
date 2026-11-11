// Decides whether a state-changing request came from this site's own pages.
// A matching Origin header is the normal proof. Firefox sends "Origin: null" (and some privacy tools remove the header)
// on a page's own requests when the page asks for no referrer; then Sec-Fetch-Site, which the browser sets itself and a
// web page cannot change, must say "same-origin".
export function fromThisSite(origin:string|null,fetchSite:string|null,expected:string){
 if(origin&&origin!=='null')return origin===expected;
 return fetchSite==='same-origin';
}
