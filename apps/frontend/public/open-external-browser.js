(function () {
  var SESSION_KEY = "bep_si_fb_external_browser_tip_closed";
  var ua = navigator.userAgent || "";
  var isInApp = /FBAN|FBAV|FB_IAB|Instagram|Zalo/i.test(ua);

  if (!isInApp) return;
  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  } catch (error) {}

  function closeTip(box) {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (error) {}
    box.remove();
  }

  function getBrowserName() {
    if (/iPhone|iPad|iPod/i.test(ua)) return "Safari";
    return "Chrome";
  }

  function injectStyles() {
    if (document.getElementById("bep-si-external-browser-style")) return;
    var style = document.createElement("style");
    style.id = "bep-si-external-browser-style";
    style.textContent = [
      ".bep-si-external-wrap{position:fixed;left:12px;right:12px;bottom:14px;z-index:999999;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;}",
      ".bep-si-external-card{width:min(460px,100%);border-radius:24px;background:#111827;color:#fff;box-shadow:0 22px 60px rgba(0,0,0,.34);overflow:hidden;border:1px solid rgba(255,255,255,.14);}",
      ".bep-si-external-head{display:flex;gap:12px;align-items:flex-start;padding:15px 15px 10px;}",
      ".bep-si-external-badge{width:44px;height:44px;border-radius:16px;background:rgba(251,146,60,.18);display:grid;place-items:center;font-size:24px;flex:0 0 auto;}",
      ".bep-si-external-title{margin:0;font-size:17px;font-weight:950;letter-spacing:-.02em;line-height:1.2;}",
      ".bep-si-external-text{margin:6px 0 0;color:#d1d5db;font-size:13px;line-height:1.5;font-weight:700;}",
      ".bep-si-external-close{margin-left:auto;width:34px;height:34px;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:20px;font-weight:900;cursor:pointer;}",
      ".bep-si-external-steps{margin:0 15px 14px;padding-left:18px;color:#f3f4f6;font-size:13px;line-height:1.55;font-weight:750;}",
      ".bep-si-external-ok{display:block;width:calc(100% - 30px);height:46px;margin:0 15px 15px;border:0;border-radius:16px;background:#fff;color:#111827;font-size:14px;font-weight:950;cursor:pointer;}"
    ].join("");
    document.head.appendChild(style);
  }

  window.addEventListener("load", function () {
    injectStyles();

    var targetBrowser = getBrowserName();
    var box = document.createElement("div");
    box.className = "bep-si-external-wrap";
    box.innerHTML = [
      '<div class="bep-si-external-card" role="dialog" aria-label="Mở bằng trình duyệt ngoài">',
      '  <div class="bep-si-external-head">',
      '    <div class="bep-si-external-badge">↗</div>',
      '    <div>',
      '      <p class="bep-si-external-title">Đang mở trong Facebook/Zalo/Instagram</p>',
      '      <p class="bep-si-external-text">Trình duyệt trong app dễ lỗi khi cài PWA. Mở bằng ' + targetBrowser + ' để tải app và nhận cập nhật ổn định.</p>',
      '    </div>',
      '    <button class="bep-si-external-close" type="button" aria-label="Đóng">×</button>',
      '  </div>',
      '  <ol class="bep-si-external-steps">',
      '    <li>Bấm dấu ba chấm hoặc nút Chia sẻ ở góc màn hình.</li>',
      '    <li>Chọn Mở bằng trình duyệt hoặc Open in ' + targetBrowser + '.</li>',
      '    <li>Sau đó bấm banner Tải app trên website.</li>',
      '  </ol>',
      '  <button class="bep-si-external-ok" type="button">Đã hiểu</button>',
      '</div>'
    ].join("");

    box.querySelector(".bep-si-external-close").addEventListener("click", function () { closeTip(box); });
    box.querySelector(".bep-si-external-ok").addEventListener("click", function () { closeTip(box); });
    document.body.appendChild(box);
  });
})();
