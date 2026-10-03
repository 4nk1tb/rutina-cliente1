const CACHE_NAME = 'repite-v2.0.5';
const ASSETS = ['./', './index.html', './app.css', './app.js', './data.js', './default-routine.js', './routine-templates.js', './share.js', './manifest.webmanifest', './favicon.svg', './repite-icon-180.png', './repite-icon-192.png', './repite-icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && (key.startsWith('repite-') || key.startsWith('rutina-elegante-'))).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname)) {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE_NAME).then(cache => cache.match(event.request))));
    return;
  }
  // Keep HTML, styles and modules in one installed version. A new worker only
  // takes over after the complete next shell has been cached successfully.
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(event.request.mode === 'navigate' ? './index.html' : event.request);
    if (cached) return cached;
    return fetch(event.request);
  }));
});
