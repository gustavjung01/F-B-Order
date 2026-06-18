(function () {
  var KEY = "bep_si_fb_app_version";
  var showing = false;

  function injectStyles() {
    if (document.getElementById("pwa-update-toast-style")) return;
    var style = document.createElement("style");
    style.id = "pwa-update-toast-style";
    style.textContent = [
      ".pwa-update-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(11,18,32,.24);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:18px;}",
      ".pwa-update-card{width:min(430px,100%);border-radius:28px;background:#fff;box-shadow:0 24px 70px rgba(11,18,32,.28);overflow:hidden;border:1px solid rgba(255,255,255,.7);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
      ".pwa-update-hero{background:linear-gradient(135deg,#ff5a00,#ff8a1f);padding:18px 18px 16px;color:#fff;display:flex;gap:14px;align-items:center;}",
      ".pwa-update-icon{width:52px;height:52px;border-radius:18px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:28px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25);}",
      ".pwa-update-title{margin:0;font-size:20px;font-weight:900;letter-spacing:-.02em;}",
      ".pwa-update-sub{margin:3px 0 0;font-size:13px;font-weight:700;opacity:.9;}",
      ".pwa-update-body{padding:16px 18px 18px;color:#0b1220;}",
      ".pwa-update-text{margin:0;font-size:14px;line-height:1.55;color:#475569;font-weight:650;}",
      ".pwa-update-actions{display:grid;grid-template-columns:1fr 1.2fr;gap:10px;margin-top:16px;}",
      ".pwa-update-later,.pwa-update-now{height:48px;border:0;border-radius:16px;font-size:15px;font-weight:900;cursor:pointer;}",
      ".pwa-update-later{background:#f3f0ea;color:#334155;}",
      ".pwa-update-now{background:#0b1220;color:#fff;box-shadow:0 10px 20px rgba(11,18,32,.18);}",
    ].join("");
    document.head.appendChild(style);
  }

  function showUpdateToast(version) {
    if (showing) return;
    showing = true;
    injectStyles();

    var backdrop = document.createElement("div");
    backdrop.className = "pwa-update-backdrop";
    backdrop.innerHTML = [
      '<div class="pwa-update-card" role="dialog" aria-live="polite" aria-label="App update available">',
      '  <div class="pwa-update-hero">',
      '    <div class="pwa-update-icon">↻</div>',
      '    <div>',
      '      <p class="pwa-update-title">Co ban moi cho Bep Si F&B</p>',
      '      <p class="pwa-update-sub">Cap nhat de xem giao dien va tinh nang moi</p>',
      '    </div>',
      '  </div>',
      '  <div class="pwa-update-body">',
      '    <p class="pwa-update-text">Ban moi da san sang. Bam cap nhat de tai lai app, giu du lieu gio hang va trai nghiem ban moi nhat.</p>',
      '    <div class="pwa-update-actions">',
      '      <button class="pwa-update-later" type="button">De sau</button>',
      '      <button class="pwa-update-now" type="button">Cap nhat ngay</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");

    backdrop.querySelector(".pwa-update-later").addEventListener("click", function () {
      showing = false;
      backdrop.remove();
    });

    backdrop.querySelector(".pwa-update-now").addEventListener("click", function () {
      localStorage.setItem(KEY, version);
      window.location.reload();
    });

    document.body.appendChild(backdrop);
  }

  function check() {
    fetch("/app-version.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.version) return;
        var current = localStorage.getItem(KEY);
        if (!current) {
          localStorage.setItem(KEY, data.version);
          return;
        }
        if (current !== data.version) {
          showUpdateToast(data.version);
        }
      })
      .catch(function () {});
  }

  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
  window.addEventListener("load", function () { setTimeout(check, 1500); });
})();
