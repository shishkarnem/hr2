/* Web Push & Notification Click Service Worker Extension */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        if (self.registration && self.registration.active === self && self.clients && self.clients.claim) {
          return self.clients.claim();
        }
      })
      .catch(function () {})
  );
});

self.addEventListener("push", function (event) {
  let payload = {
    title: "Робот Рекрутер",
    body: "Новое уведомление в вашем кабинете",
    icon: "/icons/pwa/pwa-192x192.png",
    badge: "/icons/pwa/badge-72x72.png",
    url: "/",
    tag: "rr-notification",
    data: {},
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        data: { ...(parsed.data || {}), url: parsed.url || parsed.data?.url || "/" },
      };
    }
  } catch (e) {
    try {
      const txt = event.data ? event.data.text() : "";
      if (txt) payload.body = txt;
    } catch {}
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/icons/pwa/pwa-192x192.png",
    badge: payload.badge || "/icons/pwa/badge-72x72.png",
    tag: payload.tag || "rr-notification",
    renotify: true,
    requireInteraction: false,
    vibrate: [120, 60, 120],
    data: {
      url: payload.url || "/",
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Робот Рекрутер", options),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (clientList) {
          for (const client of clientList) {
            client.postMessage({ type: "RR_PUSH_RECEIVED", payload });
          }
        })
        .catch(function () {}),
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            const destUrl = new URL(targetUrl, self.location.origin);
            if (clientUrl.origin === destUrl.origin && "focus" in client) {
              client.focus();
              if ("navigate" in client && clientUrl.pathname !== destUrl.pathname) {
                return client.navigate(destUrl.href);
              }
              return client;
            }
          } catch {}
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
