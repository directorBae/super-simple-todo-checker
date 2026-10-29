// Service worker for the web version: only shows reminders (phones' browsers require a worker for
// notifications) and brings the page back when one is tapped, telling it which reminder (the evening wrap-up opens
// "move to tomorrow?"). Nothing is cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const key = event.notification.tag || '';
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (pages.length) { pages[0].postMessage({ type: 'reminder-click', key }); return pages[0].focus(); }
    return self.clients.openWindow('./?reminder=' + encodeURIComponent(key));
  })());
});
