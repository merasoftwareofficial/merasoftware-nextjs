/*
 * Service worker for push notifications (src/docs/NOTIFICATIONS.md).
 * Shows what src/lib/push.ts sends ({ title, body, url, tag, renotify }) and
 * opens its page when the notification is clicked. It caches nothing.
 */

self.addEventListener("push", event => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Mera Software", {
      body: message.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: message.tag,
      // Browsers reject renotify without a tag.
      renotify: !!(message.renotify && message.tag),
      data: { url: message.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  // Only paths on this site are opened.
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const open = windows.find(client => client.url === target.href);
      return open ? open.focus() : self.clients.openWindow(target.href);
    }),
  );
});
