/*
 * Orbit CRM — Web Push service worker.
 *
 * Deliberately NOT a PWA worker: no fetch handler, no caches, no offline
 * support, no background sync. It exists only to (1) show a notification
 * when a push arrives and (2) open/focus the right Orbit route when the
 * user clicks it. Registering or removing it cannot change how the app
 * loads or behaves.
 */

const ICON = "/icons/icon-192.png";
const MAX_TITLE = 120;
const MAX_BODY = 300;

/** Only same-origin dashboard routes are ever navigated to. */
function safeDashboardPath(path) {
  if (typeof path !== "string") return null;
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return null;
  if (path.startsWith("//") || path.includes("\\") || path.includes(":")) {
    return null;
  }
  return path;
}

function clip(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Malformed payload: fall through to a generic notification.
    payload = {};
  }

  const title = clip(payload.title, MAX_TITLE) || "Orbit CRM";
  const options = {
    body: clip(payload.body, MAX_BODY),
    icon: ICON,
    badge: ICON,
    // Same tag = a repeated push replaces instead of stacking.
    tag: clip(payload.tag, 100) || undefined,
    data: { path: safeDashboardPath(payload.path) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const path =
    safeDashboardPath(event.notification.data && event.notification.data.path) ||
    "/dashboard";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer an Orbit tab that is already open.
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;

        try {
          if ("navigate" in client) await client.navigate(target);
          if ("focus" in client) await client.focus();
          return;
        } catch {
          // navigate()/focus() can be refused; fall back to a new window.
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});