// Service worker: שומר את מעטפת האפליקציה לפתיחה מהירה. נתונים תמיד מהשרת (לא נשמרים במכשיר).
const V = 'yoman-v54';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/api.js', '/js/ui.js', '/js/acc.js', '/js/wa-ui.js', '/js/calc.js', '/js/phone.js', '/manifest.webmanifest', '/icons/icon-192.png', '/sign.html', '/js/sign.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/webhooks/')) return;
  // רשת קודם (כדי לקבל גרסה חדשה), ואם אין קליטה — מהמטמון
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
