// ============================================================
// Service Worker для «Меню и рецепты»
// Стратегия: network-first с fallback на кеш.
// v5.5.6 (Фикс: больше не отдаёт HTML вместо CSS при сбое сети)
// ============================================================

const CACHE_NAME = 'menu-recipes-v6.3.13';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  // 1. Для навигации (открытие самого сайта) — если нет сети, отдаём index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          return caches.match('./index.html');
        })
    );
    return;
  }

  // 2. Для всех остальных ресурсов (CSS, JS, картинки) — строго сеть или кэш.
  // НИКАКИХ fallback на index.html, иначе браузер сломает верстку!
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request);
      })
  );
});
