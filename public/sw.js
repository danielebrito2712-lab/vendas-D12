const VERSION = 'vendas-d12-v2';
const APP_CACHE = `${VERSION}-app`;
const TILE_CACHE = `${VERSION}-tiles`;
const CORE = ['./', './index.html', './manifest.webmanifest', './logo-d12.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![APP_CACHE, TILE_CACHE].includes(k)).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // OpenStreetMap: usa cache quando estiver sem internet e guarda os mapas já vistos.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return new Response('', { status: 504, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // Navegação: tenta internet; se falhar abre a versão instalada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(APP_CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Arquivos do app: cache-first, atualizando quando possível.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok && url.origin === self.location.origin) {
          caches.open(APP_CACHE).then(c => c.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
