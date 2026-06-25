var oneSignalEnabled = false;

try {
  oneSignalEnabled = new URL(self.location.href).searchParams.get("onesignal") === "1";
} catch (error) {
  oneSignalEnabled = false;
}

if (oneSignalEnabled) {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
}

const CACHE_VERSION = "bep-si-fb-pwa-v12";
const RUNTIME_CACHE = "bep-si-fb-runtime-v12";
const NAVIGATION_TIMEOUT_MS = 1200;

const OFFLINE_FALLBACK = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png"
];

const STATIC_ASSET_RE = /\.(?:js|css|png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/i;
const AUTH_ROUTE_RE = /^\/(?:sign-in|sign-up)(?:\/|$)/;
const CLERK_ROUTE_RE = /^\/__clerk(?:\/|$)/;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(OFFLINE_FALLBACK);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    Promise.all([
      caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          return key !== CACHE_VERSION && key !== RUNTIME_CACHE;
        }).map(function (key) {
          return caches.delete(key);
        }));
      }),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable().catch(function () {})
        : Promise.resolve()
    ]).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function failedFetchResponse() {
  return Response.error();
}

function cacheRuntimeResponse(request, response) {
  if (!response || !response.ok) return response;

  var copy = response.clone();
  caches.open(RUNTIME_CACHE).then(function (cache) {
    cache.put(request, copy);
  }).catch(function () {});

  return response;
}

function cachedNavigationResponse(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return caches.match("/");
  });
}

function navigationNetworkFirst(event) {
  var request = event.request;
  var networkPromise = Promise.resolve(event.preloadResponse)
    .then(function (preloaded) {
      if (preloaded) return preloaded;
      return fetch(request, { cache: "no-store" });
    })
    .then(function (response) {
      return cacheRuntimeResponse(request, response);
    })
    .catch(function () {
      return null;
    });

  var timeoutPromise = new Promise(function (resolve) {
    setTimeout(function () {
      cachedNavigationResponse(request).then(resolve).catch(function () {
        resolve(null);
      });
    }, NAVIGATION_TIMEOUT_MS);
  });

  return Promise.race([networkPromise, timeoutPromise]).then(function (response) {
    if (response) return response;

    return networkPromise.then(function (networkResponse) {
      if (networkResponse) return networkResponse;
      return cachedNavigationResponse(request).then(function (cached) {
        return cached || failedFetchResponse();
      });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(RUNTIME_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var fetchPromise = fetch(request).then(function (response) {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      }).catch(function () {
        return cached || failedFetchResponse();
      });
      return cached || fetchPromise;
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (AUTH_ROUTE_RE.test(url.pathname) || CLERK_ROUTE_RE.test(url.pathname)) return;

  if (url.pathname === "/service-worker.js" || url.pathname === "/app-version.json" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(function () {
      return caches.match(request).then(function (cached) {
        return cached || failedFetchResponse();
      });
    }));
    return;
  }

  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(navigationNetworkFirst(event));
    return;
  }

  if (STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
