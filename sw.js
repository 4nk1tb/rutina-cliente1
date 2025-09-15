const CACHE_NAME = 'rutina-elegante-v1'; // Incrementa este número (v2, v3...) cada vez que hagas cambios
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  // Es buena práctica cachear también la fuente para que funcione offline
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'
];

// Evento de instalación: se abre la caché y se guardan los assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta:', CACHE_NAME);
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// Evento de activación: se limpia la caché antigua
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Borrando caché antigua:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Evento fetch: sirve los assets desde la caché si es posible (estrategia Cache-First)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si se encuentra en caché, la devuelve. Si no, la busca en la red.
        return response || fetch(event.request);
      })
  );
});
