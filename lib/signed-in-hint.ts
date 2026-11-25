// What the site header last knew about who is signed in, kept for this browser tab so the header does not flash
// "Sign in" between pages. Anything that signs someone in or out calls forgetSignedIn(), so the header asks afresh.
export const SIGNED_IN_KEY='jr.signedInAs';
export function forgetSignedIn(){try{sessionStorage.removeItem(SIGNED_IN_KEY);}catch{}}
