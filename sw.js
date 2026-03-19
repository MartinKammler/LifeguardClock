/* Service Worker für LifeguardClock
   Strategie:
   - App-Shell (HTML, CSS inline, Logo, manifest) → Cache-First
   - config.js, WebDAV (/remote.php/) → Network-First (immer aktuell)
   - Alles andere → Network-First mit Cache-Fallback
*/

const CACHE_NAME = 'lgc-shell-v7';
const APP_SHELL = [
  './LifeguardClock.html',
  './manifest.json',
  './Logo.png',
];

// ── Install: App-Shell vorhalten ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: alte Caches löschen ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Nur http/https cachen – chrome-extension:// u. ä. ignorieren
  if (!event.request.url.startsWith('http')) return;
  const url = new URL(event.request.url);

  // Network-First: config.js und WebDAV-Pfade
  if (url.pathname.endsWith('config.js') || url.pathname.includes('/remote.php/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache-First: App-Shell-Ressourcen
  if (APP_SHELL.some(path => url.pathname.endsWith(path.replace('./', '/')))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default: Network-First mit Cache-Fallback
  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`Offline und kein Cache für ${request.url}`);
  }
}
