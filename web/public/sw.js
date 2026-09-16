// Service worker: makes Koenami installable and keeps the shell fast.
// Hashed build assets are cached first (their names change on every deploy);
// pages and root files go network first so a deploy shows up immediately and
// the last copy still opens offline. Audio samples and the analysis API are
// never cached: they are large, and analysis needs the server anyway.
const CACHE='koenami-v1';
const SHELL=['/','/guide.html','/tutorial.html','/method.html','/site.webmanifest','/favicon.svg','/icon-192.png'];
addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>skipWaiting()));});
addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>clients.claim()));});
addEventListener('fetch',e=>{
 const {request}=e;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==location.origin)return;
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/samples/'))return;
 if(url.pathname.startsWith('/assets/')){
  e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(request);if(hit)return hit;const res=await fetch(request);if(res.ok)c.put(request,res.clone());return res;}));
  return;
 }
 const page=request.mode==='navigate';
 e.respondWith(caches.open(CACHE).then(async c=>{
  try{const res=await fetch(request);if(res.ok)c.put(page?new Request(url.pathname==='/'||/^\/(ja|zh-CN|en|ko)\/?$/.test(url.pathname)?'/':url.pathname):request,res.clone());return res;}
  catch(err){const hit=await c.match(page&&/^\/(ja|zh-CN|en|ko)\/?$/.test(url.pathname)?'/':request);if(hit)return hit;throw err;}
 }));
});
