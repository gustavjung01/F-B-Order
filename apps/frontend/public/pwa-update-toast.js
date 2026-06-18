(function () {
  var KEY = "bep_si_fb_app_version";

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
          localStorage.setItem(KEY, data.version);
          if (confirm("Có bản mới. Cập nhật ngay?")) window.location.reload();
        }
      })
      .catch(function () {});
  }

  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
})();
