const CACHE_VERSION = "bep-si-fb-pwa-v4";

const APP_SHELL = [
  "/",
  "/products",
  "/recipes",
  "/cart",
  "/account",
  "/register",
  "/sign-in",
  "/sign-up",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/pwa-register.js",
  "/pwa-install-button.js",
  "/pwa-update-toast.js",
  "/open-external-browser.js",
  "/app-version.json"
];

const STATIC_ASSET_RE = /\.(?:js|css|png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/i;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE_VERSION;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/app-version.json") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(function () {
      return caches.match(request);
    }));
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(function (cached) {
      return cached || fetch(request);
    }));
    return;
  }

  if (STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(caches.match(request).then(function (cached) {
      return cached || fetch(request).then(function (response) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      });
    }));
  }
});
