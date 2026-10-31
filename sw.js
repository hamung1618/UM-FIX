/* Service Worker — Laporan Uang Masuk PWA */
const CACHE_VERSION = 'um-v1.0.0';
const CACHE_STATIC = CACHE_VERSION + '-static';
const CACHE_CDN = CACHE_VERSION + '-cdn';

const STATIC_ASSETS = [
  './',
  './Laporan_Uang_Masuk.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon.svg'
];

const CDN_URLS = [
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: 'reload' })));
    // Prefetch CDN (best-effort)
    try {
      const cdnCache = await caches.open(CACHE_CDN);
      await Promise.allSettled(
        CDN_URLS.map(async (url) => {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cdnCache.put(url, res.clone());
        })
      );
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('um-') && k !== CACHE_STATIC && k !== CACHE_CDN)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isCDN(url) {
  return /cdn\.sheetjs\.com|cdnjs\.cloudflare\.com/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin: cache-first, network fallback
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        // Background refresh for HTML
        if (req.destination === 'document' || url.pathname.endsWith('.html')) {
          event.waitUntil(
            fetch(req)
              .then((res) => {
                if (res.ok) {
                  return caches.open(CACHE_STATIC).then((c) => c.put(req, res.clone()));
                }
              })
              .catch(() => {})
          );
        }
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok && (req.destination === 'document' || url.pathname.match(/\.(html|js|json|png|svg|ico)$/))) {
          const cache = await caches.open(CACHE_STATIC);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // Offline fallback to main app
        const fallback = await caches.match('./Laporan_Uang_Masuk.html');
        if (fallback) return fallback;
        throw e;
      }
    })());
    return;
  }

  // CDN (XLSX): cache-first
  if (isCDN(url.href)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE_CDN);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // Try alternate CDN from cache
        for (const alt of CDN_URLS) {
          const hit = await caches.match(alt);
          if (hit) return hit;
        }
        throw e;
      }
    })());
  }
});

// Optional: allow page to trigger skipWaiting
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
