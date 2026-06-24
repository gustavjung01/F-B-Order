import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { applyParentFixes } from "./parent-map-apply.mjs";
import { finalizeParentMap } from "./parent-map-finalize.mjs";
import { loadInputs, root } from "./parent-map-io.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../../../data/catalog/hung-phat/v2");
const outputDir = path.resolve(
  process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length)
    || path.join(root, "artifacts/catalog/hung-phat-v2-content-audit"),
);
const assetBaseUrl = (
  process.argv.find((value) => value.startsWith("--asset-base-url="))?.slice("--asset-base-url=".length)
    || process.env.CATALOG_ASSET_BASE_URL
    || "https://cdn.bepsi.click"
).replace(/\/+$/, "");

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const audit = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog-content-audit.json"), "utf8"));
const inputs = loadInputs();
const result = finalizeParentMap(applyParentFixes(inputs));
const sourceProducts = inputs.products;
const sourceByKey = new Map(sourceProducts.map((row) => [row.product_key, row]));
const parentByKey = new Map(result.parents.map((row) => [row.parent_key, row]));
const nameFixes = new Map(Object.entries(audit.nameFixes || {}));
const missingBySku = new Map((audit.missingImages || []).map((row) => [row.sku, row]));
const manualBySku = new Map((audit.manualIdentityReview || []).map((row) => [row.sku, row]));
const parentReviewByKey = new Map((audit.parentReview || []).map((row) => [row.parentKey, row]));
const skuSet = new Set(result.variants.map((row) => row.sku));
const parentKeySet = new Set(result.parents.map((row) => row.parent_key));
const sourceMissingSkus = new Set(
  result.variants.filter((row) => row.image_status === "MISSING").map((row) => row.sku),
);

assert(audit.catalogVersion === "hung-phat-v2", `Unexpected audit catalog version: ${audit.catalogVersion}`);
assert(result.variants.length === 275, `Content audit must cover 275 variants, found ${result.variants.length}.`);
assert(result.parents.length === 182, `Content audit expected 182 parents, found ${result.parents.length}.`);
assert(missingBySku.size === 6, `Expected 6 configured missing images, found ${missingBySku.size}.`);
assert(manualBySku.size === 34, `Expected 34 manual identity reviews, found ${manualBySku.size}.`);
assert(parentReviewByKey.size === 10, `Expected 10 parent reviews, found ${parentReviewByKey.size}.`);
for (const sku of [...nameFixes.keys(), ...missingBySku.keys(), ...manualBySku.keys()]) {
  assert(skuSet.has(sku), `Audit references unknown SKU ${sku}.`);
}
for (const parentKey of parentReviewByKey.keys()) {
  assert(parentKeySet.has(parentKey), `Audit references unknown parent ${parentKey}.`);
}
assert(
  sourceMissingSkus.size === missingBySku.size
    && [...sourceMissingSkus].every((sku) => missingBySku.has(sku)),
  `Configured missing-image list does not match source: ${[...sourceMissingSkus].join(", ")}`,
);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const html = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function writeCsv(filename, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  fs.writeFileSync(path.join(outputDir, filename), `${lines.join("\n")}\n`, "utf8");
}

function suspiciousNameReasons(name) {
  const reasons = [];
  const rules = [
    [/\b(?:khác|các loại|cty)\b/iu, "Tên còn placeholder/viết tắt"],
    [/\b(?:TC|ĐĐ|TS|SÔ|MÔN|HG)\b/u, "Tên còn viết tắt nội bộ"],
    [/[a-zà-ỹ]\s{2,}[a-zà-ỹ]/iu, "Tên có khoảng trắng bất thường"],
    [/\b(?:glod|gol|berino|duoxian|mozela|galatin|milkfoarm|duongden)\b/iu, "Tên có dấu hiệu sai chính tả"],
    [/[\/+]/u, "Một dòng có thể đang chứa nhiều phân loại"],
  ];
  for (const [pattern, reason] of rules) {
    if (pattern.test(name) && !reasons.includes(reason)) reasons.push(reason);
  }
  return reasons;
}

const rows = result.variants.map((variant) => {
  const source = sourceByKey.get(variant.product_key);
  const parent = parentByKey.get(variant.parent_key);
  if (!source || !parent) throw new Error(`Missing source/parent for ${variant.sku}`);

  const currentName = clean(source.name);
  const proposedName = clean(nameFixes.get(variant.sku) || currentName);
  const missing = missingBySku.get(variant.sku);
  const manual = manualBySku.get(variant.sku);
  const parentReview = parentReviewByKey.get(variant.parent_key);
  const automaticReasons = suspiciousNameReasons(currentName);
  const reasons = [
    ...automaticReasons,
    manual?.reason,
    parentReview ? `Parent ${variant.parent_key}: ${parentReview.reason}` : null,
  ].filter(Boolean);
  const imageUrl = variant.image_status === "MISSING"
    ? ""
    : `${assetBaseUrl}/catalog/hung-phat/v2/products/${variant.image_key}.webp`;
  const imageAction = missing
    ? "UPLOAD_REQUIRED"
    : manual || parentReview || proposedName !== currentName
      ? "VISUAL_REVIEW_PRIORITY"
      : "VISUAL_REVIEW_REQUIRED";
  const nameAction = manual
    ? "IDENTITY_REVIEW"
    : proposedName !== currentName
      ? "PROPOSED_FIX"
      : automaticReasons.length
        ? "NAME_REVIEW"
        : "PASS_PENDING_VISUAL";

  return {
    sku: variant.sku,
    product_key: variant.product_key,
    parent_key: variant.parent_key,
    parent_name: parent.name,
    current_name: currentName,
    proposed_name: proposedName,
    brand: clean(source.brand),
    source_category: clean(source.category),
    proposed_category: audit.categoryNameFixes?.[source.category] || source.category,
    image_key: variant.image_key,
    image_url: imageUrl,
    image_action: imageAction,
    name_action: nameAction,
    review_reason: reasons.join(" | "),
    replacement_file: `${variant.image_key}.webp`,
    approved_name: "",
    approved_image: "",
    reviewer_note: "",
  };
});

const headers = [
  "sku", "product_key", "parent_key", "parent_name", "current_name", "proposed_name",
  "brand", "source_category", "proposed_category", "image_key", "image_url", "image_action",
  "name_action", "review_reason", "replacement_file", "approved_name", "approved_image", "reviewer_note",
];
const missingRows = rows.filter((row) => row.image_action === "UPLOAD_REQUIRED");
const priorityRows = rows.filter((row) => row.image_action !== "VISUAL_REVIEW_REQUIRED");
const nameRows = rows.filter((row) => row.name_action !== "PASS_PENDING_VISUAL");

fs.mkdirSync(outputDir, { recursive: true });
writeCsv("catalog-content-audit.csv", headers, rows);
writeCsv("manual-image-upload.csv", headers, missingRows);
writeCsv("priority-image-review.csv", headers, priorityRows);
writeCsv("name-review.csv", headers, nameRows);

const summary = {
  status: "REVIEW_REQUIRED",
  totalVariants: rows.length,
  missingImageUploadCount: missingRows.length,
  priorityImageReviewCount: priorityRows.length,
  nameReviewCount: nameRows.length,
  categoryFixCount: Object.keys(audit.categoryNameFixes || {}).length,
  parentReviewCount: (audit.parentReview || []).length,
  note: "Ảnh mapped chỉ chứng minh object key tồn tại. Khớp nội dung phải được duyệt bằng audit board.",
};
fs.writeFileSync(path.join(outputDir, "audit-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

const cards = rows.map((row) => `
  <article class="card" data-action="${html(row.image_action)}" data-name-action="${html(row.name_action)}">
    <div class="image-wrap">
      ${row.image_url
        ? `<img loading="lazy" src="${html(row.image_url)}" alt="${html(row.proposed_name)}" onerror="this.closest('.image-wrap').classList.add('broken')">`
        : `<div class="missing">THIẾU ẢNH<br>${html(row.replacement_file)}</div>`}
    </div>
    <div class="body">
      <div class="meta"><b>${html(row.sku)}</b><span>${html(row.parent_key)}</span></div>
      <p class="current">Hiện tại: ${html(row.current_name)}</p>
      <h2>${html(row.proposed_name)}</h2>
      <p>${html(row.proposed_category)}${row.brand ? ` · ${html(row.brand)}` : ""}</p>
      <p class="reason">${html(row.review_reason || "Chưa có lỗi tên tự động; vẫn phải nhìn ảnh để xác nhận.")}</p>
      <a href="${html(row.image_url || "#")}" target="_blank" rel="noreferrer">Mở ảnh gốc</a>
      <code>${html(row.replacement_file)}</code>
    </div>
  </article>`).join("\n");

const page = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bếp Sỉ — Audit tên và ảnh catalog v2</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f7f3eb;color:#0b1220;font-family:Arial,sans-serif}
    header{position:sticky;top:0;z-index:2;padding:18px 24px;background:#fff;border-bottom:1px solid #eadfce}
    h1{margin:0 0 8px}.summary{font-weight:700;color:#596273}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    button{border:1px solid #e4d7c6;background:#fff;border-radius:999px;padding:9px 14px;font-weight:800;cursor:pointer}
    button.active{background:#ff5a00;color:#fff;border-color:#ff5a00}main{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:18px}
    .card{overflow:hidden;background:#fff;border-radius:22px;border:1px solid #eadfce;box-shadow:0 12px 30px rgba(15,23,42,.08)}
    .image-wrap{height:230px;display:grid;place-items:center;background:#fff4e9}.image-wrap img{width:100%;height:100%;object-fit:contain}
    .image-wrap.broken:after{content:'ẢNH CDN KHÔNG TẢI ĐƯỢC';font-weight:900;color:#b42318}.image-wrap.broken img{display:none}
    .missing{font-weight:900;text-align:center;color:#b42318}.body{padding:16px}.meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#6b7280}
    h2{font-size:20px;margin:10px 0 6px}.current{text-decoration:line-through;color:#9a3412;font-size:13px}.reason{min-height:52px;font-size:13px;color:#596273}
    a{display:inline-block;margin-right:8px;color:#ff5a00;font-weight:800}code{font-size:11px;background:#f4f1eb;padding:4px 6px;border-radius:6px}
    .hidden{display:none}
  </style>
</head>
<body>
<header>
  <h1>Audit catalog v2: tên ↔ ảnh ↔ parent map</h1>
  <div class="summary">${summary.totalVariants} SKU · ${summary.missingImageUploadCount} ảnh thiếu · ${summary.priorityImageReviewCount} dòng ưu tiên · ${summary.nameReviewCount} dòng cần duyệt tên</div>
  <div class="filters">
    <button class="active" data-filter="ALL">Tất cả</button>
    <button data-filter="UPLOAD_REQUIRED">Thiếu ảnh</button>
    <button data-filter="VISUAL_REVIEW_PRIORITY">Ưu tiên kiểm ảnh</button>
    <button data-filter="NAME">Cần duyệt tên</button>
  </div>
</header>
<main>${cards}</main>
<script>
  const buttons=[...document.querySelectorAll('button[data-filter]')];
  const cards=[...document.querySelectorAll('.card')];
  for(const button of buttons){button.addEventListener('click',()=>{
    buttons.forEach(item=>item.classList.toggle('active',item===button));
    const filter=button.dataset.filter;
    cards.forEach(card=>{
      const visible=filter==='ALL'||card.dataset.action===filter||(filter==='NAME'&&card.dataset.nameAction!=='PASS_PENDING_VISUAL');
      card.classList.toggle('hidden',!visible);
    });
  })}
</script>
</body>
</html>`;
fs.writeFileSync(path.join(outputDir, "index.html"), page, "utf8");

console.log(JSON.stringify({ ...summary, outputDir, assetBaseUrl }, null, 2));
