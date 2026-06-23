(() => {
  const payload = JSON.parse(document.getElementById("data").textContent);
  const all = payload.products;
  const storageKey = `catalog-review:${payload.catalogVersion}`;
  const saved = loadState();
  let filtered = [...all];
  let currentKey = null;

  const labels = {
    missingImage: "Thiếu ảnh",
    wrongName: "Tên sai",
    wrongOption: "Option sai",
    duplicateSku: "SKU trùng",
    wrongPrice: "Giá sai",
  };
  const byId = (id) => document.getElementById(id);

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }

  function reviewFor(productKey) {
    if (!saved[productKey]) saved[productKey] = { reviewed: false, notes: "", issues: {} };
    return saved[productKey];
  }

  function combinedIssues(product) {
    const review = reviewFor(product.productKey);
    const result = {};
    for (const key of Object.keys(labels)) {
      result[key] = Boolean(product.autoIssues[key] || review.issues[key]);
    }
    return result;
  }

  function wasMarked(product) {
    const review = reviewFor(product.productKey);
    return Object.values(review.issues || {}).some(Boolean) || Boolean(review.notes.trim());
  }

  function money(value) {
    return Number.isFinite(Number(value))
      ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value))
      : "Giá lỗi";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    })[character]);
  }

  function imageHtml(product, mode) {
    if (!product.imageUrl) return '<div class="miss"><b>!</b>Thiếu ảnh</div>';
    return `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" loading="${mode === "card" ? "lazy" : "eager"}">`;
  }

  function bindImageFallbacks(root) {
    root.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        const fallback = document.createElement("div");
        fallback.className = "miss";
        fallback.innerHTML = "<b>!</b>Ảnh không tải được";
        image.replaceWith(fallback);
      }, { once: true });
    });
  }

  function fillCategories() {
    [...new Set(all.map((product) => product.category))]
      .sort((a, b) => a.localeCompare(b, "vi"))
      .forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        byId("cat").appendChild(option);
      });
  }

  function applyFilters() {
    const query = byId("q").value.trim().toLocaleLowerCase("vi");
    const category = byId("cat").value;
    const issue = byId("issue").value;
    const reviewState = byId("review").value;

    filtered = all.filter((product) => {
      const review = reviewFor(product.productKey);
      const haystack = [
        product.name,
        product.brand,
        product.category,
        product.productKey,
        ...product.variants.map((variant) => variant.sku),
      ].join(" ").toLocaleLowerCase("vi");
      const issues = combinedIssues(product);

      if (query && !haystack.includes(query)) return false;
      if (category !== "all" && product.category !== category) return false;
      if (issue === "has" && !Object.values(issues).some(Boolean)) return false;
      if (labels[issue] && !issues[issue]) return false;
      if (reviewState === "reviewed" && !review.reviewed) return false;
      if (reviewState === "unreviewed" && review.reviewed) return false;
      if (reviewState === "marked" && !wasMarked(product)) return false;
      return true;
    });

    renderCards();
    renderStats();
  }

  function renderStats() {
    const reviewedCount = all.filter((product) => reviewFor(product.productKey).reviewed).length;
    const markedCount = all.filter(wasMarked).length;
    const missingCount = all.filter((product) => product.autoIssues.missingImage).length;
    const duplicateCount = all.filter((product) => product.autoIssues.duplicateSku).length;
    const priceCount = all.filter((product) => product.autoIssues.wrongPrice).length;

    byId("stats").innerHTML = [
      `<span class="stat">Tổng <b>${all.length}</b></span>`,
      `<span class="stat">Đang hiện <b>${filtered.length}</b></span>`,
      `<span class="stat">Đã duyệt <b>${reviewedCount}</b></span>`,
      `<span class="stat">Đánh dấu <b>${markedCount}</b></span>`,
      `<span class="stat ${missingCount ? "bad" : ""}">Thiếu ảnh <b>${missingCount}</b></span>`,
      `<span class="stat ${duplicateCount ? "bad" : ""}">SKU trùng <b>${duplicateCount}</b></span>`,
      `<span class="stat ${priceCount ? "bad" : ""}">Giá lỗi <b>${priceCount}</b></span>`,
    ].join("");
  }

  function renderCards() {
    const grid = byId("grid");
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty">Không có card phù hợp.</div>';
      return;
    }

    grid.innerHTML = filtered.map((product) => {
      const review = reviewFor(product.productKey);
      const issues = combinedIssues(product);
      const badges = Object.entries(issues)
        .filter(([, value]) => value)
        .map(([key]) => `<span class="badge bad">${labels[key]}</span>`);
      if (!badges.length) badges.push('<span class="badge ok">Chưa thấy lỗi</span>');
      if (review.reviewed) badges.push('<span class="badge note">Đã duyệt</span>');

      const options = product.optionGroups.slice(0, 3)
        .map((group) => `<span class="chip">${escapeHtml(group.name)}: ${escapeHtml(group.values.join(" / "))}</span>`)
        .join("");

      return `<article class="card"><button data-key="${escapeHtml(product.productKey)}"><div class="img">${imageHtml(product, "card")}</div><div class="body"><div class="brand">${escapeHtml(product.brand || "—")}</div><div class="name">${escapeHtml(product.name)}</div><div class="meta">${escapeHtml(product.category)} · ${escapeHtml(product.variants[0]?.sku || "Không SKU")}</div><div class="price">${money(product.priceFrom)}</div><div class="chips">${options || '<span class="chip">Không option</span>'}</div><div class="badges">${badges.join("")}</div></div></button></article>`;
    }).join("");

    bindImageFallbacks(grid);
    grid.querySelectorAll("[data-key]").forEach((button) => {
      button.addEventListener("click", () => openModal(button.dataset.key));
    });
  }

  function openModal(productKey) {
    currentKey = productKey;
    byId("modal").hidden = false;
    document.body.style.overflow = "hidden";
    renderModal();
  }

  function closeModal() {
    currentKey = null;
    byId("modal").hidden = true;
    document.body.style.overflow = "";
    applyFilters();
  }

  function currentProduct() {
    return all.find((product) => product.productKey === currentKey);
  }

  function renderModal() {
    const product = currentProduct();
    if (!product) return closeModal();

    const review = reviewFor(product.productKey);
    const filteredIndex = filtered.findIndex((item) => item.productKey === product.productKey);
    byId("headName").textContent = product.name;
    byId("count").textContent = `${filteredIndex + 1}/${filtered.length}`;
    byId("done").textContent = review.reviewed ? "✓ Đã duyệt" : "Đánh dấu đã duyệt";
    byId("done").classList.toggle("on", review.reviewed);

    byId("left").innerHTML = `<div class="hero">${imageHtml(product, "detail")}</div><div class="brand" style="margin-top:14px">${escapeHtml(product.brand || "—")}</div><h2>${escapeHtml(product.name)}</h2><div class="price">${money(product.priceFrom)}</div><div class="chips"><span class="chip">${escapeHtml(product.category)}</span><span class="chip">Ảnh: ${escapeHtml(product.imageStatus)}</span><span class="chip">Chất lượng: ${escapeHtml(product.imageQualityStatus)}</span></div>`;

    const optionRows = product.optionGroups.length
      ? product.optionGroups.map((group) => `<div class="row"><div class="label">${escapeHtml(group.name)}</div><div class="chips">${group.values.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join("")}</div></div>`).join("")
      : '<div class="meta">Không có option.</div>';

    const variantRows = product.variants.map((variant) => `<tr><td><b>${escapeHtml(variant.sku)}</b></td><td>${escapeHtml(Object.entries(variant.options || {}).map(([key, value]) => `${key}: ${value}`).join(" · ") || "—")}</td><td>${money(variant.price)}</td><td>${escapeHtml(variant.imageKey || "—")}</td></tr>`).join("");

    const issueChecks = Object.entries(labels).map(([key, label]) => {
      const checked = review.issues[key] || product.autoIssues[key];
      return `<label class="check"><input type="checkbox" data-issue="${key}" ${checked ? "checked" : ""}><span>${label}${product.autoIssues[key] ? " · tự phát hiện" : ""}</span></label>`;
    }).join("");

    byId("right").innerHTML = `<div class="section"><h3>Nhóm / vị / size / màu / loại</h3>${optionRows}</div><div class="section"><h3>SKU tương ứng</h3><div style="overflow:auto"><table><thead><tr><th>SKU</th><th>Option</th><th>Giá</th><th>Ảnh</th></tr></thead><tbody>${variantRows}</tbody></table></div></div><div class="section"><h3>Chỉ đánh dấu lỗi cần sửa</h3><div class="checks">${issueChecks}</div><textarea id="notes" placeholder="Tên đúng, option đúng hoặc giá đúng...">${escapeHtml(review.notes)}</textarea></div>`;

    bindImageFallbacks(byId("left"));
    document.querySelectorAll("[data-issue]").forEach((input) => {
      input.addEventListener("change", (event) => {
        review.issues[event.target.dataset.issue] = event.target.checked;
        saveState();
        renderStats();
      });
    });
    byId("notes").addEventListener("input", (event) => {
      review.notes = event.target.value;
      saveState();
    });
  }

  function move(delta) {
    if (!filtered.length) return;
    const index = Math.max(0, filtered.findIndex((product) => product.productKey === currentKey));
    currentKey = filtered[(index + delta + filtered.length) % filtered.length].productKey;
    renderModal();
  }

  function toggleReviewed() {
    const product = currentProduct();
    if (!product) return;
    const review = reviewFor(product.productKey);
    review.reviewed = !review.reviewed;
    saveState();
    renderModal();
    renderStats();
  }

  function csvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const rows = all.map((product) => {
      const review = reviewFor(product.productKey);
      const issues = combinedIssues(product);
      return {
        product_key: product.productKey,
        name: product.name,
        sku: product.variants.map((variant) => variant.sku).join(" | "),
        missing_image: issues.missingImage,
        wrong_name: issues.wrongName,
        wrong_option: issues.wrongOption,
        duplicate_sku: issues.duplicateSku,
        wrong_price: issues.wrongPrice,
        reviewed: review.reviewed,
        notes: review.notes,
      };
    }).filter((row) => row.missing_image || row.wrong_name || row.wrong_option || row.duplicate_sku || row.wrong_price || row.notes);

    const headers = Object.keys(rows[0] || {
      product_key: "", name: "", sku: "", missing_image: "", wrong_name: "",
      wrong_option: "", duplicate_sku: "", wrong_price: "", reviewed: "", notes: "",
    });
    const text = [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(","))].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }));
    link.download = `${payload.catalogVersion}-review-issues.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  fillCategories();
  applyFilters();
  ["q", "cat", "issue", "review"].forEach((id) => {
    byId(id).addEventListener(id === "q" ? "input" : "change", applyFilters);
  });
  byId("export").addEventListener("click", exportCsv);
  byId("close").addEventListener("click", closeModal);
  document.querySelector(".back").addEventListener("click", closeModal);
  byId("prev").addEventListener("click", () => move(-1));
  byId("prevTop").addEventListener("click", () => move(-1));
  byId("next").addEventListener("click", () => move(1));
  byId("done").addEventListener("click", toggleReviewed);
  window.addEventListener("keydown", (event) => {
    if (byId("modal").hidden) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
})();
