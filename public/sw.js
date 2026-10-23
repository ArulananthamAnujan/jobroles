// JobRoles service worker: pages always come from the network (job data must be current); static assets are
// cached after first use; with no connection, a page request falls back to the offline page.
const CACHE='jobroles-v2';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/offline.html','/assets/brand.svg'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const r=e.request,url=new URL(r.url);
 if(r.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))return;
 if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('/offline.html')));return;}
 if(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/assets/')){
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));}return res;})));
 }
});
// Push notifications for job alerts. The payload is {title, body, url}; tapping opens the url on this site.
self.addEventListener('push',e=>{
 let d={};try{d=e.data?e.data.json():{};}catch{}
 e.waitUntil(self.registration.showNotification(d.title||'New jobs on JobRoles',{body:d.body||'',icon:'/assets/icon-192.png',badge:'/assets/icon-192.png',data:{url:typeof d.url==='string'&&d.url.startsWith('/')?d.url:'/'}}));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();const url=e.notification.data?.url||'/';
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const open=list.find(c=>new URL(c.url).origin===self.location.origin);if(open){open.focus();return open.navigate(url);}return self.clients.openWindow(url);}));
});
