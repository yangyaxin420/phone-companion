self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('message', e => {
  if (e.data.type === 'schedule-notification') {
    const { title, body, time } = e.data;
    const now = Date.now();
    const delay = Math.max(0, time - now);
    setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        requireInteraction: true
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
