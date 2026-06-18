(function () {
  var DISMISSED_UNTIL_KEY = "bep_si_fb_pwa_install_dismissed_until";
  var INSTALLED_KEY = "bep_si_fb_pwa_installed";
  var DISMISS_DAYS = 7;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var deferredPrompt = null;
  var banner = null;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (error) {}
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isAdminPath() {
    return window.location.pathname.indexOf("/admin") === 0;
  }

  function getInstallCopy() {
    if (isAdminPath()) {
      return {
        aria: "Tải app Bếp Sỉ Admin",
        title: "Tải app Bếp Sỉ Admin",
        subtitle: "Mở nhanh khu quản trị đơn hàng, khách sỉ và cập nhật trạng thái.",
      };
    }

    return {
      aria: "Tải app Bếp Sỉ F&B",
      title: "Tải app Bếp Sỉ F&B",
      subtitle: "Mở nhanh từ màn hình chính, nhận bản mới ổn định hơn.",
    };
  }

  function isProbablyInstalled() {
    return isStandalone() || safeGet(INSTALLED_KEY) === "1";
  }

  function isDismissed() {
    var until = Number(safeGet(DISMISSED_UNTIL_KEY) || 0);
    return until > Date.now();
  }

  function dismissBanner() {
    safeSet(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_DAYS * DAY_MS));
    removeBanner();
  }

  function isInAppBrowser() {
    return /FBAN|FBAV|FB_IAB|Instagram|Zalo/i.test(navigator.userAgent || "");
  }

  function isIos() {
    var ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isIosSafari() {
    var ua = navigator.userAgent || "";
    return isIos() && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Zalo/i.test(ua);
  }

  function isMobileLike() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints || 0) > 1;
  }

  function shouldShowBanner() {
    if (isProbablyInstalled()) return false;
    if (isDismissed()) return false;
    if (isInAppBrowser()) return false;
    return Boolean(deferredPrompt || isIosSafari());
  }

  function injectStyles() {
    if (document.getElementById("bep-si-pwa-install-style")) return;
    var style = document.createElement("style");
    style.id = "bep-si-pwa-install-style";
    style.textContent = [
      ".bep-si-install-wrap{position:fixed;left:12px;right:12px;bottom:14px;z-index:9997;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;pointer-events:none;}",
      ".bep-si-install-card{width:min(440px,100%);border-radius:24px;background:#fff;color:#0f172a;box-shadow:0 22px 60px rgba(15,23,42,.28);border:1px solid rgba(148,163,184,.24);overflow:hidden;pointer-events:auto;}",
      ".bep-si-install-head{display:flex;align-items:flex-start;gap:12px;padding:14px 14px 10px;background:linear-gradient(135deg,#fff7ed,#ffedd5);}",
      ".bep-si-install-icon{width:48px;height:48px;border-radius:16px;object-fit:cover;box-shadow:0 8px 18px rgba(234,88,12,.22);flex:0 0 auto;}",
      ".bep-si-install-title{margin:0;font-size:17px;line-height:1.2;font-weight:950;letter-spacing:-.02em;}",
      ".bep-si-install-sub{margin:4px 0 0;font-size:13px;line-height:1.35;color:#64748b;font-weight:700;}",
      ".bep-si-install-close{margin-left:auto;width:34px;height:34px;border:0;border-radius:999px;background:rgba(15,23,42,.08);color:#0f172a;font-size:20px;font-weight:800;line-height:1;cursor:pointer;}",
      ".bep-si-install-body{padding:12px 14px 14px;}",
      ".bep-si-install-steps{margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.55;font-weight:700;}",
      ".bep-si-install-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:13px;}",
      ".bep-si-install-later,.bep-si-install-now{height:46px;border:0;border-radius:15px;font-size:14px;font-weight:950;cursor:pointer;}",
      ".bep-si-install-later{background:#f1f5f9;color:#334155;}",
      ".bep-si-install-now{background:#0f172a;color:#fff;box-shadow:0 10px 22px rgba(15,23,42,.2);}",
      "@media (min-width:768px){.bep-si-install-wrap{left:auto;right:18px;width:420px;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function removeBanner() {
    if (banner) {
      banner.remove();
      banner = null;
    }
  }

  function renderBanner() {
    if (!shouldShowBanner() || banner || !document.body) return;
    injectStyles();

    var ios = isIosSafari();
    var copy = getInstallCopy();
    banner = document.createElement("div");
    banner.className = "bep-si-install-wrap";
    banner.innerHTML = [
      '<div class="bep-si-install-card" role="dialog" aria-label="' + copy.aria + '">',
      '  <div class="bep-si-install-head">',
      '    <img class="bep-si-install-icon" src="/icons/icon-192.png" alt="" width="48" height="48">',
      '    <div>',
      '      <p class="bep-si-install-title">' + copy.title + '</p>',
      '      <p class="bep-si-install-sub">' + copy.subtitle + '</p>',
      '    </div>',
      '    <button class="bep-si-install-close" type="button" aria-label="Đóng">×</button>',
      '  </div>',
      '  <div class="bep-si-install-body">',
      ios ? '    <ol class="bep-si-install-steps"><li>Bấm nút Chia sẻ của Safari.</li><li>Chọn Thêm vào Màn hình chính.</li><li>Bấm Thêm để lưu app.</li></ol>' : '    <ol class="bep-si-install-steps"><li>Bấm Tải app để cài lên màn hình chính.</li><li>Sau khi cài, mở app bằng icon mới.</li></ol>',
      '    <div class="bep-si-install-actions">',
      '      <button class="bep-si-install-later" type="button">Để sau</button>',
      '      <button class="bep-si-install-now" type="button">' + (ios ? 'Đã hiểu' : 'Tải app') + '</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");

    banner.querySelector(".bep-si-install-close").addEventListener("click", dismissBanner);
    banner.querySelector(".bep-si-install-later").addEventListener("click", dismissBanner);
    banner.querySelector(".bep-si-install-now").addEventListener("click", function () {
      if (ios) {
        dismissBanner();
        return;
      }
      window.bepSiInstallPwa();
    });

    document.body.appendChild(banner);
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    setTimeout(renderBanner, 350);
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    safeSet(INSTALLED_KEY, "1");
    removeBanner();
  });

  window.bepSiInstallPwa = async function () {
    if (isProbablyInstalled()) return;
    if (!deferredPrompt) {
      if (isIos()) {
        renderBanner();
        return;
      }
      alert("Mở bằng Chrome hoặc Edge rồi bấm Tải app để cài lên màn hình chính.");
      return;
    }
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (error) {}
    deferredPrompt = null;
    removeBanner();
  };

  window.addEventListener("load", function () {
    if (!isMobileLike() && !deferredPrompt) return;
    setTimeout(renderBanner, 1200);
  });
})();
