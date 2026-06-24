(() => {
  const payload = JSON.parse(document.getElementById("data").textContent);
  const all = payload.products;
  const storageKey = `catalog-review:${payload.catalogVersion}`;
  const saved = loadState();
  const orderState = new Map();
  const activeRowState = new Map();
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
        const fallbackSource = image.dataset.fallbackSrc;
        if (fallbackSource && image.dataset.fallbackUsed !== "1") {
          image.dataset.fallbackUsed = "1";
          image.src = fallbackSource;
          return;
        }
        const fallback = document.createElement("div");
        fallback.className = "miss";
        fallback.innerHTML = "<b>!</b>Ảnh không tải được";
        image.replaceWith(fallback);
      });
    });
  }

  function variantVisual(product, variant) {
    const hasVariantImage = Boolean(
      variant &&
      variant.imageKey &&
      variant.imageStatus !== "MISSING",
    );

    if (hasVariantImage) {
      return {
        url: `./assets/${variant.imageKey}.webp`,
        fallbackUrl: product.imageUrl || "",
        status: "Ảnh biến thể",
      };
    }

    if (product.imageUrl) {
      return {
        url: product.imageUrl,
        fallbackUrl: "",
        status: variant ? "Ảnh cha (biến thể thiếu ảnh)" : "Ảnh sản phẩm cha",
      };
    }

    return { url: "", fallbackUrl: "", status: "Thiếu ảnh" };
  }

  function variantImageHtml(product, variant) {
    const visual = variantVisual(product, variant);
    if (!visual.url) return '<div class="miss"><b>!</b>Thiếu ảnh</div>';
    const fallbackAttribute = visual.fallbackUrl
      ? ` data-fallback-src="${escapeHtml(visual.fallbackUrl)}"`
      : "";
    return `<img src="${escapeHtml(visual.url)}"${fallbackAttribute} alt="${escapeHtml(variant?.name || product.name)}" loading="eager">`;
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

      return `<article class="card"><button data-key="${escapeHtml(product.productKey)}"><div class="img">${imageHtml(product, "card")}</div><div class="body"><div class="brand">${escapeHtml(product.brand || "—")}</div><div class="name">${escapeHtml(product.name)}</div><div class="meta">${escapeHtml(product.category)} · ${product.variantCount || product.variants.length} phân loại</div><div class="price">Từ ${money(product.priceFrom)}</div><div class="chips">${options || '<span class="chip">Không option</span>'}</div><div class="badges">${badges.join("")}</div></div></button></article>`;
    }).join("");

    bindImageFallbacks(grid);
    grid.querySelectorAll("[data-key]").forEach((button) => {
      button.addEventListener("click", () => openModal(button.dataset.key));
    });
  }

  function defaultSelections(product) {
    const result = {};
    const firstVariant = product.variants[0];
    for (const group of product.optionGroups) {
      result[group.name] = firstVariant?.options?.[group.name] ?? group.values[0] ?? "";
    }
    return result;
  }

  function ensureOrderRows(product) {
    if (!orderState.has(product.productKey)) {
      orderState.set(product.productKey, [{ selections: defaultSelections(product), quantity: 1 }]);
    }
    return orderState.get(product.productKey);
  }

  function activeRowIndex(product) {
    const rows = ensureOrderRows(product);
    const stored = activeRowState.get(product.productKey) ?? 0;
    return Math.max(0, Math.min(stored, rows.length - 1));
  }

  function setActiveRow(product, index) {
    const rows = ensureOrderRows(product);
    activeRowState.set(product.productKey, Math.max(0, Math.min(index, rows.length - 1)));
  }

  function matchVariant(product, row) {
    if (!product.variants.length) return null;
    if (!product.optionGroups.length) return product.variants[0];

    const selections = Object.entries(row.selections)
      .filter(([, value]) => value !== "" && value != null);

    return product.variants.find((variant) =>
      selections.every(([label, value]) =>
        String(variant.options?.[label] ?? "") === String(value),
      ),
    ) || null;
  }

  function reconcileSelections(product, row, changedGroupName) {
    if (matchVariant(product, row)) return;

    const selectedValue = row.selections[changedGroupName];
    const compatibleVariant = product.variants.find((variant) =>
      String(variant.options?.[changedGroupName] ?? "") === String(selectedValue),
    );

    if (!compatibleVariant) return;
    for (const group of product.optionGroups) {
      if (compatibleVariant.options?.[group.name] != null) {
        row.selections[group.name] = compatibleVariant.options[group.name];
      }
    }
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

    byId("left").innerHTML = `<div id="activeVariantHero" class="hero"></div><div class="product-meta"><div class="brand">${escapeHtml(product.brand || "—")}</div><h2>${escapeHtml(product.name)}</h2><p id="activeVariantName" class="variant-name"></p><div id="activeVariantPrice" class="price"></div><div class="chips"><span class="chip">${escapeHtml(product.category)}</span><span id="activeVariantImageStatus" class="chip"></span><span id="activeVariantSku" class="chip"></span></div><p class="local-note">Chọn vị/size/loại nào thì ảnh, SKU và giá đổi theo đúng biến thể đó.</p></div>`;

    renderOrderRows(product);
    renderAudit(product);
  }

  function updateActiveVariantPreview(product) {
    const rows = ensureOrderRows(product);
    const index = activeRowIndex(product);
    const variant = matchVariant(product, rows[index]);
    const visual = variantVisual(product, variant);
    const hero = byId("activeVariantHero");

    hero.innerHTML = variantImageHtml(product, variant);
    bindImageFallbacks(hero);

    byId("activeVariantName").textContent = variant?.name || "Không có biến thể cho tổ hợp đã chọn";
    byId("activeVariantPrice").textContent = variant ? money(variant.price) : "Không có giá";
    byId("activeVariantSku").textContent = `SKU: ${variant?.sku || "Không có"}`;
    byId("activeVariantImageStatus").textContent = `Ảnh: ${visual.status}`;

    document.querySelectorAll("[data-order-row]").forEach((rowElement) => {
      rowElement.classList.toggle(
        "active",
        Number(rowElement.dataset.orderRow) === index,
      );
    });
  }

  function renderOrderRows(product) {
    const rows = ensureOrderRows(product);
    const activeIndex = activeRowIndex(product);
    const container = byId("orderRows");

    container.innerHTML = rows.map((row, rowIndex) => {
      const variant = matchVariant(product, row);
      const fields = product.optionGroups.map((group, groupIndex) => {
        const options = group.values
          .map((value) => `<option value="${escapeHtml(value)}" ${row.selections[group.name] === value ? "selected" : ""}>${escapeHtml(value)}</option>`)
          .join("");
        return `<div class="field"><label>${escapeHtml(group.name)}</label><select data-row="${rowIndex}" data-group="${groupIndex}">${options}</select></div>`;
      }).join("");

      const imageTag = variant?.imageStatus !== "MISSING"
        ? "Có ảnh riêng"
        : "Dùng ảnh cha";
      const activeTag = rowIndex === activeIndex
        ? '<span class="active-variant-tag">Ảnh đang xem</span>'
        : "";

      return `<div class="order-row ${rowIndex === activeIndex ? "active" : ""}" data-order-row="${rowIndex}">${fields || '<div class="field"><label>Phân loại</label><select disabled><option>Mặc định</option></select></div>'}<div class="variant-info">${activeTag}<b>${escapeHtml(variant?.sku || "Không có SKU")}</b><br>${variant ? money(variant.price) : "Tổ hợp không tồn tại"}<br><small>${imageTag}</small></div><div class="qty"><button data-minus="${rowIndex}" type="button">−</button><span>${row.quantity}</span><button data-plus="${rowIndex}" type="button">+</button></div><button class="remove" data-remove="${rowIndex}" type="button" ${rows.length === 1 ? "disabled" : ""}>×</button></div>`;
    }).join("");

    container.querySelectorAll("[data-order-row]").forEach((rowElement) => {
      rowElement.addEventListener("click", (event) => {
        if (event.target.closest(".remove")) return;
        setActiveRow(product, Number(rowElement.dataset.orderRow));
        updateActiveVariantPreview(product);
      });
    });

    container.querySelectorAll("select[data-row]").forEach((select) => {
      select.addEventListener("change", (event) => {
        const rowIndex = Number(event.target.dataset.row);
        const groupIndex = Number(event.target.dataset.group);
        const group = product.optionGroups[groupIndex];
        rows[rowIndex].selections[group.name] = event.target.value;
        reconcileSelections(product, rows[rowIndex], group.name);
        setActiveRow(product, rowIndex);
        renderOrderRows(product);
      });
    });

    container.querySelectorAll("[data-minus]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.minus);
        rows[index].quantity = Math.max(1, rows[index].quantity - 1);
        setActiveRow(product, index);
        renderOrderRows(product);
      });
    });

    container.querySelectorAll("[data-plus]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.plus);
        rows[index].quantity += 1;
        setActiveRow(product, index);
        renderOrderRows(product);
      });
    });

    container.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.remove);
        if (rows.length > 1) rows.splice(index, 1);
        setActiveRow(product, Math.min(activeRowIndex(product), rows.length - 1));
        renderOrderRows(product);
      });
    });

    updateOrderSummary(product);
    updateActiveVariantPreview(product);
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
      total += Number(variant.price || 0) * row.quantity;
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
    const rows = ensureOrderRows(product);
    rows.push({ selections: defaultSelections(product), quantity: 1 });
    setActiveRow(product, rows.length - 1);
    renderOrderRows(product);
  }

  function simulateAddToCart() {
    const product = currentProduct();
    if (!product) return;
    const validRows = ensureOrderRows(product)
      .map((row) => ({ row, variant: matchVariant(product, row) }))
      .filter(({ variant }) => Boolean(variant));
    const quantity = validRows.reduce((sum, item) => sum + item.row.quantity, 0);
    showToast(`Preview: đã mô phỏng thêm ${validRows.length} phân loại / ${quantity} sản phẩm. Chưa ghi vào giỏ thật.`);
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
