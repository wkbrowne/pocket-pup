// Keeps a copy of the game on the device so it opens with no internet. The page itself is fetched fresh when there is a connection, so updates arrive.
const CACHE = 'pup-c4471c18cf', VOICE = 'pup-voice-1', FILES = ["index.html", "pupgrader.js", "fonts/LilitaOne-Regular.ttf", "fonts/Nunito.ttf", "icon-180.png", "icon-192.png", "icon-512.png", "manifest.webmanifest"];      // the reading voice is big, so it is kept across game updates
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'].concat(FILES))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== VOICE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/tts\//.test(u.pathname)){ e.respondWith(caches.open(VOICE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; })))); return; }
  const page = e.request.mode === 'navigate' || u.pathname.endsWith('/index.html');
  if (page) e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
