// Where to send a visitor who arrived at the "www." twin of the site's address (or the other way round), or null
// when they are already on the proper address. Only the proper address accepts sign-ins and holds sign-in cookies.
export function twinRedirect(host:string|null,appOrigin:string|undefined,pathAndQuery:string):string|null{
 if(!host||!appOrigin)return null;
 let expected:URL;try{expected=new URL(appOrigin);}catch{return null;}
 const seen=host.toLowerCase().replace(/:\d+$/,''),want=expected.hostname.toLowerCase();
 if(seen===want||(seen!==`www.${want}`&&want!==`www.${seen}`))return null;
 return `${expected.origin}${pathAndQuery.startsWith('/')?pathAndQuery:'/'}`;
}
