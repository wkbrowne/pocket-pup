#!/usr/bin/env python3
"""Builds the web version in docs/ (served by GitHub Pages) from index.html.
Adds what a home-screen web app on an iPad or tablet needs: local fonts, icons, a manifest, and a service worker so it runs offline."""
import hashlib, io, json, os, shutil

src = io.open('index.html', encoding='utf-8').read()

# Before anything is built, the game's script is checked for syntax errors (with the JavaScript engine that ships with macOS).
# A stray comment in the middle of a line has broken a release before; this stops the build instead.
import re, subprocess, sys, tempfile
JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc'
if os.path.exists(JSC):
    for code in re.findall(r'<script>(.*?)</script>', src, re.S):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t: t.write(code)
        out = subprocess.run([JSC, '-e', 'try { checkSyntax(%r); print("ok"); } catch (e) { print("SYNTAX ERROR: " + e); }' % t.name], capture_output=True, text=True).stdout.strip()
        os.unlink(t.name)
        if out != 'ok': sys.exit('index.html did not pass the syntax check, nothing was built.\n' + out)
    print('syntax ok')
    # the shared learning engine: the copy inside the page must be the copy in vendor/, and the engine's own tests must pass
    core = io.open('vendor/learn-core.js', encoding='utf-8').read().rstrip('\n')
    a0 = src.index('/* <learn-core>'); a0 = src.index('\n', a0) + 1; b0 = src.index('/* </learn-core> */')
    if src[a0:b0].rstrip('\n') != core: sys.exit('The engine inside index.html differs from vendor/learn-core.js. Run sync-core.py; never edit the engine in the page.')
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as t:
        t.write(core + '\nvar c = LearnCore.checks(), bad = Object.keys(c).filter(function (k) { return c[k] !== true; });\nfor (var s0 = 1; s0 <= 10; s0++) LearnCore.simulate({skills: 28, total: 300, seed: s0 * 31}).broke.forEach(function (b) { bad.push(b); });\nprint(bad.length ? "ENGINE FAILED: " + bad.join("; ") : "engine ok " + LearnCore.VERSION + ", " + Object.keys(c).length + " rules");')
    out = subprocess.run([JSC, t.name], capture_output=True, text=True).stdout.strip(); os.unlink(t.name)
    if not out.startswith('engine ok'): sys.exit('The learning engine did not pass its tests, nothing was built.\n' + out)
    print(out)
else: print('syntax not checked: jsc not found')
# the hand-written banks: no bank may lean on the right answer being the longest (generators are measured on the ?debug page)
if subprocess.run([sys.executable, 'scan-bias.py', '--check']).returncode: sys.exit('nothing was built.')
font = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;800&display=swap">'
assert src.count(font) == 1
head = """<style>@font-face{font-family:'Lilita One';src:url(fonts/LilitaOne-Regular.ttf)}@font-face{font-family:'Nunito';font-weight:200 1000;src:url(fonts/Nunito.ttf)}</style>
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#2B2350">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Pop Pup">
<link rel="apple-touch-icon" href="icon-180.png">"""
page = '<!doctype html>\n' + src.replace(font, head) + "\n<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n"
io.open('docs/index.html', 'w', encoding='utf-8').write(page)
shutil.copyfile('pupgrader.js', 'docs/pupgrader.js')

json.dump({"name": "Population Pup", "short_name": "Pop Pup", "description": "Raise a pup and build cities with math and English.", "start_url": "./", "scope": "./", "display": "fullscreen", "orientation": "landscape",
           "background_color": "#2B2350", "theme_color": "#2B2350", "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}]},
          io.open('docs/manifest.webmanifest', 'w', encoding='utf-8'), indent=1)

files = ['index.html', 'pupgrader.js', 'fonts/LilitaOne-Regular.ttf', 'fonts/Nunito.ttf', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']
ver = hashlib.sha1(b''.join(open('docs/' + f, 'rb').read() for f in files)).hexdigest()[:10]
io.open('docs/sw.js', 'w', encoding='utf-8').write("""// Keeps a copy of the game on the device so it opens with no internet. The page itself is fetched fresh when there is a connection, so updates arrive.
const CACHE = 'pup-%s', VOICE = 'pup-voice-1', FILES = %s;      // the reading voice is big, so it is kept across game updates
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'].concat(FILES))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== VOICE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\\/tts\\//.test(u.pathname)){ e.respondWith(caches.open(VOICE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; })))); return; }
  const page = e.request.mode === 'navigate' || u.pathname.endsWith('/index.html');
  if (page) e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
""" % (ver, json.dumps(files)))
print('docs built', ver)

# the iPad app bundles the same page with its fonts and the grader model, and no service worker
web = 'ios/PopulationPup/Web'; os.makedirs(web + '/fonts', exist_ok=True)
io.open(web + '/index.html', 'w', encoding='utf-8').write('<!doctype html>\n' + src.replace(font, head.split('\n')[0]))
shutil.copyfile('pupgrader.js', web + '/pupgrader.js')
for f in ['LilitaOne-Regular.ttf', 'Nunito.ttf']: shutil.copyfile('docs/fonts/' + f, web + '/fonts/' + f)
shutil.rmtree(web + '/tts', ignore_errors=True)   # the story voice is not packaged in the app; the iPad's own voice reads aloud
print('ios web built')
