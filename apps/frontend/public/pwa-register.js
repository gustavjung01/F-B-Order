(function () {
  if (!("serviceWorker" in navigator)) return;

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
    navigator.serviceWorker.register("/service-worker.js").then(function (registration) {
      installUpdateHandlers(registration);
      setTimeout(function () {
        registration.update().catch(function () {});
      }, 2500);
    }).catch(function (error) {
      console.warn("Service worker registration failed:", error);
    });
  });
})();
