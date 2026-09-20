const VERSION='2.2.2';
const CACHE_PREFIX='news-toeic-github-';
const CACHE=CACHE_PREFIX+VERSION;
const SHELL=['./','./index.html','./app.js','./styles.css','./voice-image-upgrade.js','./ui-feedback.js','./pwa-runtime.js','./manifest-original.webmanifest','./icon-original-192.png','./icon-original-512.png','./apple-touch-original.png','./data/news.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='GET_VERSION'&&event.ports?.[0])event.ports[0].postMessage({version:VERSION})});
async function networkFirst(request,fallback){try{const r=await fetch(request,{cache:'no-store'});if(r&&r.ok){const c=await caches.open(CACHE);await c.put(request,r.clone())}return r}catch(_){return await caches.match(request)||await caches.match(fallback)||Response.error()}}
self.addEventListener('fetch',event=>{const r=event.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;if(r.mode==='navigate'){event.respondWith(networkFirst(r,'./index.html'));return}if(/\.(?:js|css|webmanifest)$/.test(u.pathname)||/\/data\/news\.json$/.test(u.pathname)){event.respondWith(networkFirst(r));return}event.respondWith(caches.match(r).then(hit=>hit||fetch(r)))})
