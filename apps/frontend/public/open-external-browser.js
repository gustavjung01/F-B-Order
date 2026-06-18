(function () {
  var ua = navigator.userAgent || "";
  var isInApp = /FBAN|FBAV|FB_IAB|Instagram|Zalo/i.test(ua);
  if (!isInApp) return;

  window.addEventListener("load", function () {
    var box = document.createElement("div");
    box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;background:#111827;color:#fff;border-radius:16px;padding:14px;font-family:system-ui";
    box.innerHTML = "<b>Đang mở trong Facebook/Zalo</b><div style='font-size:13px;margin-top:6px'>Để cài app ổn định, hãy mở link bằng Chrome hoặc Safari.</div><button style='margin-top:10px;border:0;border-radius:999px;padding:8px 12px;font-weight:700'>Đã hiểu</button>";
    box.querySelector("button").onclick = function () { box.remove(); };
    document.body.appendChild(box);
  });
})();
