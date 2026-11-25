// Optional parts of the site that the owner switches on where the site is hosted.
// Sponsored jobs (paid advertising through Stripe) are off unless SPONSORED_JOBS is set to "on". While off, employers
// see no sponsorship screens, buttons or prices anywhere, and the payment routes refuse every request.
export function sponsoredJobs(){return process.env.SPONSORED_JOBS?.trim().toLowerCase()==='on';}
