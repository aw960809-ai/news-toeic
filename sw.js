const VERSION='2.6.2';
const CACHE_PREFIX='news-toeic-github-';
const CACHE=CACHE_PREFIX+VERSION;
const SHELL=["./", "./index.html", "./app.js", "./styles.css", "./toeic-random-engine.js", "./voice-image-upgrade.js", "./analysis-appdeploy-parity.js", "./appdeploy-parity-runtime.js", "./headline-lesson-generator.js", "./lesson-flow-parity.js", "./vocab-goal-sync.js","./study-workbench.js", "./ui-feedback.js", "./pwa-runtime.js", "./manifest-original.webmanifest", "./icon-original-192.png", "./icon-original-512.png", "./apple-touch-original.png", "./data/news.json", "./data/part1-bank.json", "./audio/manifest.json", "./assets/part1/airport-counter.svg", "./assets/part1/conference-presentation.svg", "./assets/part1/train-platform.svg", "./assets/part1/office-notes.svg", "./assets/part1/delivery-box.svg", "./assets/part1/warehouse-boxes.svg", "./assets/part1/meeting-table.svg", "./assets/part1/store-display.svg"];
const root=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(SHELL.map(url=>new Request(new URL(url,root),{cache:'reload'})))})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();if(e.data?.type==='GET_VERSION')e.ports?.[0]?.postMessage({version:VERSION})});
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==root.origin||!u.pathname.startsWith(root.pathname))return;
 const rel=u.pathname.slice(root.pathname.length),clean=new Request(new URL(rel||'index.html',root));
 if(rel==='data/news.json'){
  e.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(r,{cache:'no-store'});if(!response.ok)throw Error(response.status);await cache.put(clean,response.clone());return response}catch{return await cache.match(clean)||new Response(JSON.stringify({articles:[],offline:true}),{status:503,headers:{'Content-Type':'application/json'}})}})());return;
 }
 const key=r.mode==='navigate'?new Request(new URL('index.html',root)):clean;
 e.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(key)||fetch(r)})());
});
