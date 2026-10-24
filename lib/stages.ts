// Plain-English names for application stages and states, as job seekers see them.
const NAMES:Record<string,string>={new:'Applied',submitted:'Applied',reviewed:'Reviewed',shortlisted:'Shortlisted',interview:'Interviewing',offer:'Offer',hired:'Hired',rejected:'Not progressing',withdrawn:'Withdrawn',draft:'Draft',expired:'Expired'};
export const stageName=(s:string)=>NAMES[s]??s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
