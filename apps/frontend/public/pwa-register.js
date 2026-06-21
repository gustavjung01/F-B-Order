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

  var applyingUpdate = false;

  function installUpdateHandlers(registration) {
    if (!registration) return;

    registration.addEventListener("updatefound", function () {
      var worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", function () {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent("bep-si-fb-sw-update-ready", { detail: { registration: registration } }));
        }
      });
    });

    window.addEventListener("bep-si-fb-apply-update", function () {
      applyingUpdate = true;
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      registration.update().then(function () {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }).catch(function () {
        applyingUpdate = false;
      });
    });
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!applyingUpdate) return;
    window.location.reload();
  });

  window.addEventListener("load", function () {
    var serviceWorkerUrl = "/service-worker.js";

    if (window.__FB_ORDER_RUNTIME__ && window.__FB_ORDER_RUNTIME__.enableOneSignal) {
      serviceWorkerUrl += "?onesignal=1";
    }

    navigator.serviceWorker.register(serviceWorkerUrl).then(function (registration) {
      installUpdateHandlers(registration);
      setTimeout(function () {
        registration.update().catch(function () {});
      }, 2500);
    }).catch(function (error) {
      console.warn("Service worker registration failed:", error);
    });
  });
})();
