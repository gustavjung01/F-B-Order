(function () {
  var deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    localStorage.setItem("bep_si_fb_pwa_installed", "1");
  });

  window.bepSiInstallPwa = async function () {
    if (isStandalone()) return;
    if (!deferredPrompt) {
      alert("Android: mở bằng Chrome/Edge để cài. iPhone: mở Safari > Chia sẻ > Thêm vào Màn hình chính.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  };
})();
