// Push only: application documents and assets always use the network.
const BUILD = /*__BUILD__*/ "development";
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("pulso-"))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.allSettled(
        windows.map((client) => {
          const url = new URL(client.url);
          const auth =
            url.pathname === "/oauth/authorize" ||
            url.pathname === "/connect/mcp" ||
            url.searchParams.has("connect");
          if (
            url.origin === self.location.origin &&
            auth &&
            url.searchParams.get("__pulso_build") !== BUILD
          ) {
            url.searchParams.set("__pulso_build", BUILD);
            return client.navigate(url.href);
          }
        }),
      );
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "PULSO_ACTIVATE")
    event.waitUntil(self.skipWaiting());
  if (event.data?.type === "PULSO_VERSION")
    event.ports[0]?.postMessage({
      type: "PULSO_VERSION",
      build: BUILD,
      cacheEnabled: false,
    });
});
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Pulso", {
      body: data.body || "Tienes un recordatorio",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.taskId || "pulso",
      data: { url: "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) =>
        windows.length ? windows[0].focus() : clients.openWindow("/"),
      ),
  );
});
