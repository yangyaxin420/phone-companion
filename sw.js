const CACHE = 'phone-companion-v2';
const STATIC = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/app.js',
  './js/weather.js',
  './js/tasks.js',
  './js/expense.js',
  './js/chat.js',
  './js/secret.js',
  './js/moments.js',
  './js/persona.js',
  './js/companion.js',
  './js/tide.js',
  './js/settings.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => null))
  );
});

self.addEventListener('message', e => {
  if (e.data.type === 'schedule-notification') {
    const { title, body, time } = e.data;
    const delay = Math.max(0, time - Date.now());
    setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: true
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./'));
});
