(function () {
  if (!("serviceWorker" in navigator)) return;

  var isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (isLocalhost) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(registrations.map(function (registration) {
          return registration.unregister();
        }));
      }).then(function () {
        if (!window.caches) return null;
        return caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) {
            return caches.delete(key);
          }));
        });
      }).catch(function () {});
    });
    return;
  }

  var reloading = false;
  var registration = null;
  var lastUpdateCheck = 0;
  var UPDATE_CHECK_INTERVAL = 60 * 1000;

  function reloadOnce(buildId) {
    if (reloading) return;

    var storageKey = buildId ? "bep-si-fb-sw-reloaded:" + buildId : "";
    try {
      if (storageKey && sessionStorage.getItem(storageKey) === "1") return;
      if (storageKey) sessionStorage.setItem(storageKey, "1");
    } catch (error) {}

    reloading = true;
    window.location.reload();
  }

  navigator.serviceWorker.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "PWA_RELEASE_ACTIVATED") return;

    var port = event.ports && event.ports[0];
    if (!port) {
      if (data.isUpdate) reloadOnce(data.buildId);
      return;
    }

    var fallbackReload = setTimeout(function () {
      if (data.isUpdate) reloadOnce(data.buildId);
    }, 1700);

    port.onmessage = function (ackEvent) {
      var ack = ackEvent.data;
      if (!ack || ack.type !== "PWA_RELEASE_ACKNOWLEDGED" || ack.buildId !== data.buildId) return;

      clearTimeout(fallbackReload);
      if (data.isUpdate) reloadOnce(data.buildId);
    };

    port.postMessage({ type: "PWA_RELEASE_ACK", buildId: data.buildId });
  });

  function checkForUpdate(force) {
    if (!registration) return;

    var now = Date.now();
    if (!force && now - lastUpdateCheck < UPDATE_CHECK_INTERVAL) return;
    lastUpdateCheck = now;
    registration.update().catch(function () {});
  }

  window.addEventListener("pageshow", function () {
    checkForUpdate(false);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkForUpdate(false);
  });

  window.addEventListener("load", function () {
    var serviceWorkerUrl = "/service-worker.js";

    if (window.__FB_ORDER_RUNTIME__ && window.__FB_ORDER_RUNTIME__.enableOneSignal) {
      serviceWorkerUrl += "?onesignal=1";
    }

    navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: "/",
      updateViaCache: "none",
    }).then(function (registered) {
      registration = registered;
      checkForUpdate(true);
    }).catch(function (error) {
      console.warn("Service worker registration failed:", error);
    });
  });
})();
