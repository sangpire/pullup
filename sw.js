// 간단한 오프라인 캐시 (앱 셸만)
const CACHE = 'pullup-v1';
const SHELL = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/store.js', 'js/program.js', 'js/coach.js', 'js/camera.js', 'js/views.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (new URL(e.request.url).origin !== location.origin) return; // CDN·모델은 네트워크로
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
