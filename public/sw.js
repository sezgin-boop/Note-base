// Notebase service worker: keeps the app shell available offline.
// Board data lives in IndexedDB and syncs through Supabase, so only static files are cached here.
// The build replaces __BUILD_ID__, so every deploy installs a fresh worker and cache.
const CACHE = 'notebase-shell-__BUILD_ID__';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) return;

  // Pages: network first so updates show up, the cached copy when the network is slow or down.
  // Always answer with *something*: a page request the worker can't answer makes Safari show
  // "the server stopped responding" instead of the app.
  if (req.mode === 'navigate') {
    event.respondWith(openPage(req));
    return;
  }

  // Built assets have content hashes in their names, so cache-first is safe.
  event.respondWith(
    caches
      .match(req)
      .then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      )
      .catch(() => fetch(req)),
  );
});

const wait = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

async function openPage(req) {
  // A fresh request (not the browser's navigation object, which Safari can refuse to replay).
  const network = fetch(req.url, { credentials: 'same-origin', cache: 'no-store' })
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
      }
      return res;
    })
    .catch(() => null);
  // A slow connection: show the saved app after a few seconds instead of a spinner forever.
  const first = await Promise.race([network, wait(4000)]);
  if (first) return first;
  const saved = await caches.match('/').catch(() => null);
  if (saved) return saved;
  const late = await network;
  if (late) return late;
  return new Response(OFFLINE, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

const OFFLINE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notebase</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#ddd;
font:16px -apple-system,system-ui,sans-serif;text-align:center}button{margin-top:16px;padding:12px 22px;border:0;border-radius:12px;
background:#7c5cf0;color:#fff;font:inherit;font-weight:600}</style></head><body><div><b>Notebase can't reach the internet</b>
<p style="color:#999;max-width:300px">Your boards are safe on this device. Check the connection and try again.</p>
<button onclick="location.reload()">Try again</button></div><script>addEventListener('online',()=>location.reload())</script></body></html>`;
