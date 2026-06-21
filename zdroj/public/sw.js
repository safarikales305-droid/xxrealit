// Service worker pro PWA push notifikace a badge na ikoně.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const fallback = {
    title: 'XXrealit',
    body: 'Máte nové upozornění.',
    url: '/',
    badge: 1,
  };
  let payload = fallback;
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...fallback, ...parsed };
    }
  } catch {
    /* use fallback */
  }

  const tasks = [
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'xxrealit',
      data: { url: payload.url || '/', badge: payload.badge },
      renotify: true,
    }),
  ];

  const badgeCount = Number(payload.badge);
  if (Number.isFinite(badgeCount) && badgeCount > 0 && 'setAppBadge' in self.registration) {
    tasks.push(
      self.registration.setAppBadge(Math.min(99, Math.floor(badgeCount))),
    );
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SET_BADGE') {
    const count = Number(data.count);
    if ('setAppBadge' in self.registration) {
      if (!Number.isFinite(count) || count <= 0) {
        event.waitUntil(self.registration.clearAppBadge());
      } else {
        event.waitUntil(self.registration.setAppBadge(Math.min(99, Math.floor(count))));
      }
    }
  }
});
