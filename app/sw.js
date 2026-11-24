// Retire the old /app/ install without bypassing its save-before-update flow.
const NOTES_URL = "https://notes.usearbor.app/";
const APP_SCOPE_PATH = new URL(self.registration.scope).pathname;

function isAppPath(pathname) {
  return pathname === APP_SCOPE_PATH.replace(/\/$/, "") || pathname.startsWith(APP_SCOPE_PATH);
}

self.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "ARBOR_APPLY_UPDATE") return;
  event.waitUntil((async function () {
    const source = event.source;
    const port = event.ports && event.ports[0];
    let sourceURL;
    try { sourceURL = source && new URL(source.url); } catch (_) {}
    if (!source || source.type !== "window" || !sourceURL
        || sourceURL.origin !== self.location.origin || !isAppPath(sourceURL.pathname)) {
      if (port) port.postMessage({ type: "ARBOR_UPDATE_REJECTED" });
      return;
    }

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appClients = clients.filter(function (client) {
      try {
        const url = new URL(client.url);
        return url.origin === self.location.origin && isAppPath(url.pathname);
      } catch (_) { return false; }
    });
    if (appClients.length !== 1 || appClients[0].id !== source.id) {
      if (port) port.postMessage({ type: "ARBOR_UPDATE_BLOCKED", reason: "other-tabs" });
      return;
    }

    try {
      await self.skipWaiting();
      if (port) port.postMessage({ type: "ARBOR_UPDATE_ACCEPTED" });
    } catch (_) {
      if (port) port.postMessage({ type: "ARBOR_UPDATE_REJECTED" });
    }
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter(function (name) {
      return name.startsWith("arbor-shell-")
        || name.startsWith("arbor-runtime-")
        || name === "transformers-cache";
    }).map(function (name) { return caches.delete(name); }));

    await self.clients.claim();
    // The existing update client reloads after activation. Its navigation is
    // redirected by this worker's fetch handler to the notes origin.
  })());
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && isAppPath(url.pathname)) {
    event.respondWith(Response.redirect(NOTES_URL, 302));
  }
});
