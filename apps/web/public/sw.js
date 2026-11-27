const CACHE = 'pulso-shell-v1';
const ASSETS = /*__ASSETS__*/[];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/theme-init.js', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...ASSETS])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pulso-') && k !== CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // OAuth redirects and protocol endpoints belong to the network. Following
  // their redirect inside respondWith can leave Window.location at authorize
  // while returning the SPA HTML from the redirect destination.
  const networkOnly = /^\/(api|oauth|mcp|\.well-known)(\/|$)/.test(url.pathname)
    || url.pathname === '/connect/mcp' || url.searchParams.has('connect');
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || networkOnly) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.redirected) return Response.redirect(response.url, 302);
      if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(c => c.put('/', copy)); } return response;
    }).catch(() => caches.match('/')));
  } else if (url.pathname.startsWith('/assets/') || url.pathname === '/theme-init.js') {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(c => c.put(event.request, copy)); } return response;
    })));
  }
});
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title || 'Pulso', { body: data.body || 'Tienes un recordatorio', icon: '/icon-192.png', badge: '/icon-192.png', tag: data.taskId || 'pulso', data: { url: '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => windows.length ? windows[0].focus() : clients.openWindow('/')));
});
