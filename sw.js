/* Offline režim. Soubory appky: nejdřív síť (změny jsou hned vidět), při výpadku cache.
   Verzi cache zvyš při změně seznamu SHELL. Cizí adresy (Google přihlášení, Disk) se nikdy neukládají. */
const CACHE = 'budgetovka-v3';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'rules.js',
  'cats.js',
  'analytics.js',
  'importer.js',
  'app.js',
  'kit.js',
  'views.js',
  'dialogs.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});
