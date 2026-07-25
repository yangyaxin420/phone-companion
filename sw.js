const CACHE = 'phone-v10-clean';
const SW_VERSION = 8;

self.addEventListener('install', e => {
  console.log('[SW] Install v' + SW_VERSION);
  // 删除所有旧缓存
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => {
      if (k !== CACHE) return caches.delete(k);
    })))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] Activate v' + SW_VERSION);
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  // HTML文件永不缓存，直接从网络拉最新版
  if (e.request.mode === 'navigate' || (e.request.url.includes('.html'))) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // 其他资源（JS/CSS/图片）：网络优先，缓存兜底
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
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
