// Service worker for the web version: only shows reminders (phones' browsers require a worker for
// notifications) and brings the page back when one is tapped. Nothing is cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (pages.length) return pages[0].focus();
    return self.clients.openWindow('./');
  })());
});
