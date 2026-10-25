// Service worker: lets the app install on the home screen and open quickly.
// Always tries the network first so updates show up straight away.
const CACHE = "nailbook-v32";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    // "no-cache" = always ask the server if the file changed (skips Chrome's 10-minute file cache)
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(res => {
      if (!res.ok) return res;
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});

// Push notifications (new booking, cancellation, confirmation, reminders) — shown with the phone's normal sound.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Онлайн-запись", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Онлайн-запись", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || "./" },
    icon: "icons/icon-192.png", badge: "icons/icon-192.png", vibrate: [200, 100, 200], requireInteraction: false
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.split("#")[0].split("?")[0] === url.split("#")[0].split("?")[0] && "focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
