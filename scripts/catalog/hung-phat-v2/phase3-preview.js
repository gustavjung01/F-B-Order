(() => {
  const payload = JSON.parse(document.getElementById("data").textContent);
  const all = payload.products;
  const storageKey = `catalog-review:${payload.catalogVersion}`;
  const saved = loadState();
  const orderState = new Map();
  let filtered = [...all];
  let currentKey = null;
  let toastTimer = null;

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
      ? new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(Number(value))
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

  function defaultSelections(product) {
    const result = {};
    for (const group of product.optionGroups) {
      result[group.name] = group.values[0] ?? "";
    }
    return result;
  }

  function ensureOrderRows(product) {
    if (!orderState.has(product.productKey)) {
      orderState.set(product.productKey, [{ selections: defaultSelections(product), quantity: 1 }]);
    }
    return orderState.get(product.productKey);
  }

  function matchVariant(product, row) {
    if (!product.variants.length) return null;
    if (!product.optionGroups.length) return product.variants[0];

    const selectedValues = Object.values(row.selections).filter(Boolean);
    return product.variants.find((variant) => {
      const variantValues = Object.values(variant.options || {}).map(String);
      return selectedValues.every((value) => variantValues.includes(String(value)));
    }) || product.variants[0];
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

    const filteredIndex = filtered.findIndex((item) => item.productKey === product.productKey);
    byId("headName").textContent = product.name;
    byId("count").textContent = `${filteredIndex + 1}/${filtered.length}`;

    byId("left").innerHTML = `<div class="hero">${imageHtml(product, "detail")}</div><div class="product-meta"><div class="brand">${escapeHtml(product.brand || "—")}</div><h2>${escapeHtml(product.name)}</h2><div class="price">${money(product.priceFrom)}</div><div class="chips"><span class="chip">${escapeHtml(product.category)}</span><span class="chip">Ảnh: ${escapeHtml(product.imageStatus)}</span><span class="chip">SKU: ${escapeHtml(product.variants[0]?.sku || "—")}</span></div><p class="local-note">Ảnh preview dùng file local, không phụ thuộc DNS public của R2.</p></div>`;
    bindImageFallbacks(byId("left"));

    renderOrderRows(product);
    renderAudit(product);
  }

  function renderOrderRows(product) {
    const rows = ensureOrderRows(product);
    const container = byId("orderRows");

    container.innerHTML = rows.map((row, rowIndex) => {
      const variant = matchVariant(product, row);
      const fields = product.optionGroups.map((group, groupIndex) => {
        const options = group.values.map((value) => `<option value="${escapeHtml(value)}" ${row.selections[group.name] === value ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
        return `<div class="field"><label>${escapeHtml(group.name)}</label><select data-row="${rowIndex}" data-group="${groupIndex}">${options}</select></div>`;
      }).join("");

      return `<div class="order-row">${fields || '<div class="field"><label>Phân loại</label><select disabled><option>Mặc định</option></select></div>'}<div class="variant-info">${escapeHtml(variant?.sku || "Không tìm thấy SKU")}<br>${money(variant?.price ?? product.priceFrom)}</div><div class="qty"><button data-minus="${rowIndex}" type="button">−</button><span>${row.quantity}</span><button data-plus="${rowIndex}" type="button">+</button></div><button class="remove" data-remove="${rowIndex}" type="button" ${rows.length === 1 ? "disabled" : ""}>×</button></div>`;
    }).join("");

    container.querySelectorAll("select[data-row]").forEach((select) => {
      select.addEventListener("change", (event) => {
        const rowIndex = Number(event.target.dataset.row);
        const groupIndex = Number(event.target.dataset.group);
        const group = product.optionGroups[groupIndex];
        rows[rowIndex].selections[group.name] = event.target.value;
        renderOrderRows(product);
      });
    });

    container.querySelectorAll("[data-minus]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.minus);
        rows[index].quantity = Math.max(1, rows[index].quantity - 1);
        renderOrderRows(product);
      });
    });

    container.querySelectorAll("[data-plus]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.plus);
        rows[index].quantity += 1;
        renderOrderRows(product);
      });
    });

    container.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.remove);
        if (rows.length > 1) rows.splice(index, 1);
        renderOrderRows(product);
      });
    });

    updateOrderSummary(product);
  }

  function updateOrderSummary(product) {
    const rows = ensureOrderRows(product);
    let quantity = 0;
    let total = 0;
    let validRows = 0;

    for (const row of rows) {
      const variant = matchVariant(product, row);
      if (!variant) continue;
      validRows += 1;
      quantity += row.quantity;
      total += Number(variant.price || product.priceFrom || 0) * row.quantity;
    }

    byId("orderSummary").textContent = `${validRows} phân loại · ${quantity} sản phẩm`;
    byId("orderTotal").textContent = money(total);
    byId("addCart").textContent = `Thêm ${validRows} phân loại – ${quantity} sản phẩm vào giỏ`;
    byId("addCart").disabled = validRows === 0 || quantity === 0;
  }

  function renderAudit(product) {
    const review = reviewFor(product.productKey);
    const checks = Object.entries(labels).map(([key, label]) => {
      const checked = review.issues[key] || product.autoIssues[key];
      return `<label class="check"><input type="checkbox" data-issue="${key}" ${checked ? "checked" : ""}><span>${label}${product.autoIssues[key] ? " · tự phát hiện" : ""}</span></label>`;
    }).join("");

    byId("auditContent").innerHTML = `<div class="audit-grid">${checks}</div><textarea id="notes" placeholder="Tên đúng, option đúng hoặc giá đúng...">${escapeHtml(review.notes)}</textarea><div class="review-actions"><button id="reviewDone" class="review-done ${review.reviewed ? "on" : ""}" type="button">${review.reviewed ? "✓ Đã duyệt" : "Đánh dấu đã duyệt"}</button></div>`;

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

    byId("reviewDone").addEventListener("click", () => {
      review.reviewed = !review.reviewed;
      saveState();
      renderAudit(product);
      renderStats();
    });
  }

  function addOrderRow() {
    const product = currentProduct();
    if (!product) return;
    ensureOrderRows(product).push({ selections: defaultSelections(product), quantity: 1 });
    renderOrderRows(product);
  }

  function simulateAddToCart() {
    const product = currentProduct();
    if (!product) return;
    const rows = ensureOrderRows(product);
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    showToast(`Preview: đã mô phỏng thêm ${quantity} sản phẩm. Chưa ghi vào giỏ thật.`);
  }

  function showToast(message) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function move(delta) {
    if (!filtered.length) return;
    const index = Math.max(0, filtered.findIndex((product) => product.productKey === currentKey));
    currentKey = filtered[(index + delta + filtered.length) % filtered.length].productKey;
    renderModal();
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
  byId("prevTop").addEventListener("click", () => move(-1));
  byId("nextTop").addEventListener("click", () => move(1));
  byId("addRow").addEventListener("click", addOrderRow);
  byId("addCart").addEventListener("click", simulateAddToCart);

  window.addEventListener("keydown", (event) => {
    if (byId("modal").hidden) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
})();
