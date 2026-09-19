// ============================================================
// Service Worker для «Меню и рецепты»
// Стратегия: network-first с fallback на кеш.
// При первой загрузке SW кеширует всё, что запрошено.
// Если сети нет — отдаёт из кеша.
// При обновлении приложения всегда тянет свежие файлы из сети.
// ============================================================

const CACHE_NAME = 'menu-recipes-v1';

// Установка: сразу активируемся, не ждём закрытия всех вкладок
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// Активация: удаляем старые кеши и берём контроль над страницами
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

// Перехват запросов: сначала сеть, при ошибке — кеш.
// Успешные ответы кешируем на будущее.
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Кешируем только успешные ответы своего origin
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
  );
});
