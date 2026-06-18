(function () {
  if (!("serviceWorker" in navigator)) return;

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
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      registration.update().then(function () {
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }).catch(function () {});
    });
  }

  var refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js?v=" + Date.now()).then(function (registration) {
      installUpdateHandlers(registration);
      registration.update().catch(function () {});
    }).catch(function (error) {
      console.warn("Service worker registration failed:", error);
    });
  });
})();
