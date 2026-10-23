import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest{
 return {name:'JobRoles: Australian jobs with the pay shown',short_name:'JobRoles',description:'Every listing shows its pay range and comes from a verified employer.',start_url:'/?source=pwa',scope:'/',display:'standalone',background_color:'#172b3a',theme_color:'#172b3a',lang:'en-AU',categories:['business','productivity'],
  icons:[{src:'/assets/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/assets/icon-512.png',sizes:'512x512',type:'image/png'},{src:'/assets/brand.svg',sizes:'any',type:'image/svg+xml'}],
  shortcuts:[{name:'Search jobs',url:'/search'},{name:'My applications',url:'/job-seeker?view=applications'}]};
}
