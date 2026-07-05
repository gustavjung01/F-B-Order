var oneSignalEnabled = false;

try {
  oneSignalEnabled = new URL(self.location.href).searchParams.get("onesignal") === "1";
} catch (error) {
  oneSignalEnabled = false;
}

if (oneSignalEnabled) {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
}

const BUILD_ID = __PWA_BUILD_ID__;
const PRECACHE = "bep-si-fb-pwa-" + BUILD_ID;
const ASSET_CACHE = "bep-si-fb-assets-" + BUILD_ID;
const OFFLINE_URL = "/offline.html";
const APP_CACHE_PREFIXES = [
  "bep-si-fb-pwa-",
  "bep-si-fb-runtime-",
  "bep-si-fb-assets-",
];
const IMMUTABLE_ASSET_PREFIX = "/_next/static/";
const NAVIGATION_TIMEOUT_MS = 8000;
const AUTH_ROUTE_RE = /^\/(?:sign-in|sign-up)(?:\/|$)/;
const CLERK_ROUTE_RE = /^\/__clerk(?:\/|$)/;

function isAppCache(cacheName) {
  return APP_CACHE_PREFIXES.some(function (prefix) {
    return cacheName.indexOf(prefix) === 0;
  });
}

function failedFetchResponse() {
  return Response.error();
}

function fetchWithTimeout(request, timeoutMs) {
  if (typeof AbortController === "undefined") {
    return fetch(request, { cache: "no-store" });
  }

  var controller = new AbortController();
  var timeout = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  return fetch(request, { cache: "no-store", signal: controller.signal }).finally(function () {
    clearTimeout(timeout);
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(function (cache) {
        return cache.add(new Request(OFFLINE_URL, { cache: "reload" })).catch(function () {});
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

function notifyClientOfRelease(client, isUpdate) {
  if (!client) return Promise.resolve();

  if (!isUpdate || typeof MessageChannel === "undefined") {
    client.postMessage({
      type: "PWA_RELEASE_ACTIVATED",
      buildId: BUILD_ID,
      isUpdate: isUpdate,
    });
    return Promise.resolve();
  }

  return new Promise(function (resolve) {
    var settled = false;
    var channel = new MessageChannel();
    var timeout = setTimeout(function () {
      if (settled) return;
      settled = true;

      if (typeof client.navigate === "function") {
        Promise.resolve(client.navigate(client.url)).catch(function () {}).then(resolve);
        return;
      }

      resolve();
    }, 1200);

    channel.port1.onmessage = function (event) {
      var data = event.data;
      if (!data || data.type !== "PWA_RELEASE_ACK" || data.buildId !== BUILD_ID) return;

      settled = true;
      clearTimeout(timeout);
      channel.port1.postMessage({
        type: "PWA_RELEASE_ACKNOWLEDGED",
        buildId: BUILD_ID,
      });
      resolve();
    };

    client.postMessage(
      {
        type: "PWA_RELEASE_ACTIVATED",
        buildId: BUILD_ID,
        isUpdate: true,
      },
      [channel.port2],
    );
  });
}

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        var previousReleaseExists = keys.some(function (key) {
          return isAppCache(key) && key !== PRECACHE && key !== ASSET_CACHE;
        });

        return Promise.all([
          Promise.all(keys.filter(function (key) {
            return isAppCache(key) && key !== PRECACHE && key !== ASSET_CACHE;
          }).map(function (key) {
            return caches.delete(key);
          })),
          self.registration.navigationPreload
            ? self.registration.navigationPreload.enable().catch(function () {})
            : Promise.resolve(),
        ]).then(function () {
          return self.clients.claim();
        }).then(function () {
          return self.clients.matchAll({ type: "window", includeUncontrolled: true });
        }).then(function (clients) {
          return Promise.all(clients.map(function (client) {
            return notifyClientOfRelease(client, previousReleaseExists);
          }));
        });
      }),
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function navigationFromNetwork(event) {
  return Promise.resolve(event.preloadResponse)
    .then(function (preloaded) {
      if (preloaded) return preloaded;
      return fetchWithTimeout(event.request, NAVIGATION_TIMEOUT_MS);
    })
    .catch(function () {
      return caches.match(OFFLINE_URL).then(function (offline) {
        return offline || failedFetchResponse();
      });
    });
}

function immutableAssetCacheFirst(request) {
  return caches.open(ASSET_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;

      return fetch(request).then(function (response) {
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(function () {});
        }
        return response;
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (AUTH_ROUTE_RE.test(url.pathname) || CLERK_ROUTE_RE.test(url.pathname)) return;

  if (
    url.pathname === "/service-worker.js" ||
    url.pathname === "/app-version.json" ||
    url.pathname === "/pwa-register.js" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(navigationFromNetwork(event));
    return;
  }

  if (url.pathname.indexOf(IMMUTABLE_ASSET_PREFIX) === 0) {
    event.respondWith(immutableAssetCacheFirst(request));
  }
});
