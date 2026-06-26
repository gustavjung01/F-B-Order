(function () {
  if (!("serviceWorker" in navigator)) return;

  var isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalhost) {
    window.addEventListener("load", function () {
      navigator.serviceWorker
        .getRegistrations()
        .then(function (registrations) {
          return Promise.all(
            registrations.map(function (registration) {
              return registration.unregister();
            }),
          );
        })
        .then(function () {
          if (!window.caches) return undefined;
          return caches.keys().then(function (keys) {
            return Promise.all(
              keys.map(function (key) {
                return caches.delete(key);
              }),
            );
          });
        })
        .catch(function () {});
    });
    return;
  }

  var hadController = Boolean(navigator.serviceWorker.controller);
  var reloadTriggered = false;
  var registrationRef = null;

  function requestUpdate(registration) {
    if (!registration) return;

    registration.update().catch(function () {});

    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController || reloadTriggered) return;
    reloadTriggered = true;
    window.location.reload();
  });

  navigator.serviceWorker.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "BEP_SI_SW_ACTIVATED") return;
    document.documentElement.dataset.pwaBuild = event.data.buildId || "unknown";
  });

  window.addEventListener("load", function () {
    var serviceWorkerUrl = "/service-worker.js";

    if (
      window.__FB_ORDER_RUNTIME__ &&
      window.__FB_ORDER_RUNTIME__.enableOneSignal
    ) {
      serviceWorkerUrl += "?onesignal=1";
    }

    navigator.serviceWorker
      .register(serviceWorkerUrl, {
        scope: "/",
        updateViaCache: "none",
      })
      .then(function (registration) {
        registrationRef = registration;

        registration.addEventListener("updatefound", function () {
          var worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", function () {
            if (worker.state === "installed" && registration.waiting) {
              registration.waiting.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        requestUpdate(registration);
      })
      .catch(function (error) {
        console.warn("Service worker registration failed:", error);
      });
  });

  window.addEventListener("pageshow", function () {
    requestUpdate(registrationRef);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      requestUpdate(registrationRef);
    }
  });

  window.setInterval(function () {
    if (document.visibilityState === "visible") {
      requestUpdate(registrationRef);
    }
  }, 5 * 60 * 1000);
})();
