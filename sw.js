const CACHE = 'phone-v3';
const SW_VERSION = 3;

self.addEventListener('install', e => {
  console.log('[SW] Install v' + SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] Activate v' + SW_VERSION);
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data.type === 'schedule-notification') {
    const { title, body, time } = e.data;
    const delay = Math.max(0, time - Date.now());
    setTimeout(() => {
      self.registration.showNotification(title, {
        body, icon: 'icon-192.png', badge: 'icon-192.png',
        vibrate: [200, 100, 200], requireInteraction: true
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
