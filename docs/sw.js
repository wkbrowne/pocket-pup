// Keeps a copy of the game on the device so it opens with no internet. The page itself is fetched fresh when there is a connection, so updates arrive.
const CACHE = 'pup-3657d1a580', FILES = ["index.html", "pupgrader.js", "fonts/LilitaOne-Regular.ttf", "fonts/Nunito.ttf", "icon-180.png", "icon-192.png", "icon-512.png", "manifest.webmanifest"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'].concat(FILES))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const page = e.request.mode === 'navigate' || u.pathname.endsWith('/index.html');
  if (page) e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
