import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const argument = (name, fallback = null) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const upper = (value) => clean(value).toLocaleUpperCase("vi-VN");
const lower = (value) => clean(value).toLocaleLowerCase("vi-VN");
const numberOrNull = (value) => {
  if (value === null || value === undefined || clean(value) === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue) : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
const stableStringify = (value) => JSON.stringify(stableValue(value));
const readJson = (filePath, label) => {
  if (!fs.existsSync(filePath)) throw Object.assign(new Error(`${label} is missing: ${filePath}`), { code: "CATALOG_AUDIT_FILE_MISSING" });
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
};
const csv = (value) => {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const pushIssue = (issues, severity, code, message, current = null, expected = null) => issues.push({ severity, code, message, current, expected });
const expectedMeasureKind = (row) => {
  if (lower(row.measureMode) === "count_only" || (!numberOrNull(row.netQuantity) && !clean(row.netUnit))) return "count";
  if (["g", "kg"].includes(lower(row.netUnit))) return "mass";
  if (["ml", "l"].includes(lower(row.netUnit))) return "volume";
  return null;
};
const expectedPackaging = (row) => {
  const measureMode = lower(row.measureMode) === "count_only" || (!numberOrNull(row.netQuantity) && !clean(row.netUnit)) ? "count_only" : "measured";
  return { measureMode, sellUnit: lower(row.sellUnit), packageQuantity: numberOrNull(row.packageQuantity), packageUnit: lower(row.packageUnit), netQuantity: measureMode === "measured" ? numberOrNull(row.netQuantity) : null, netUnit: measureMode === "measured" ? lower(row.netUnit) : null };
};

function normalizeManifest(task, raw) {
  const isCorrection = Number(raw?.correctionModelVersion) === 1;
  const parents = new Map(Object.entries(raw.targetParents || {}).map(([detailGroup, parent]) => [detailGroup, { detailGroup, productKey: clean(parent.productKey), name: clean(parent.name), brand: clean(parent.brand) }]));
  if (!parents.size && raw.targetParent) {
    const detailGroup = clean(raw.detailGroup);
    parents.set(detailGroup, { detailGroup, productKey: clean(raw.targetParent.productKey), name: clean(raw.targetParent.name), brand: clean(raw.targetParent.brand) });
  }
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((source, index) => {
    const detailGroup = clean(source.detailGroup || raw.detailGroup);
    const parent = parents.get(detailGroup) || null;
    let productType = clean(source.productType);
    let flavor = clean(source.flavor);
    if (task.attributePolicy === "legacy_flavor_split") { productType = clean(task.productType); flavor = clean(source.type); }
    return { rowNo: Number(source.rowNo) || index + 1, taskId: clean(raw.taskId || task.taskId), catalogGroupKey: clean(raw.catalogGroupKey), catalogGroupName: clean(raw.catalogGroupName), action: upper(source.action || (raw.schemaVersion === 1 ? "REMAP" : "")), legacySku: clean(source.legacySku), canonicalSku: clean(source.canonicalSku), name: clean(source.name), detailGroup, targetParentKey: clean(source.targetParentKey || parent?.productKey), parent, attributePolicy: clean(task.attributePolicy), explicitAttributes: isCorrection || Number(raw.attributeModelVersion) === 1, productType, flavor, legacyType: clean(source.type), measureKind: lower(source.measureKind || expectedMeasureKind(source)), expectedColor: lower(source.color || source.mau || source["Màu"]), ...expectedPackaging(source) };
  });
  return { taskId: clean(raw.taskId || task.taskId), groupKey: clean(raw.groupKey), catalogGroupKey: clean(raw.catalogGroupKey), catalogGroupName: clean(raw.catalogGroupName), parents, rows };
}

function collectSkuObjects(value, target = new Map(), duplicates = new Map()) {
  if (Array.isArray(value)) { for (const item of value) collectSkuObjects(item, target, duplicates); return target; }
  if (!isRecord(value)) return target;
  if (clean(value.sku)) {
    const key = upper(value.sku);
    if (target.has(key)) duplicates.set(key, (duplicates.get(key) || 1) + 1); else target.set(key, value);
  }
  for (const child of Object.values(value)) collectSkuObjects(child, target, duplicates);
  return target;
}

function extractPagination(payload) {
  const candidates = [payload, payload?.data, payload?.meta, payload?.pagination, payload?.data?.meta, payload?.data?.pagination].filter(isRecord);
  const read = (...keys) => {
    for (const candidate of candidates) for (const key of keys) if (candidate[key] !== undefined && candidate[key] !== null && clean(candidate[key]) !== "") return candidate[key];
    return null;
  };
  const hasNext = read("hasNext", "has_next", "hasMore", "has_more");
  return { nextCursor: clean(read("nextCursor", "next_cursor", "cursorNext")) || null, page: numberOrNull(read("page", "currentPage", "current_page")), totalPages: numberOrNull(read("totalPages", "total_pages", "pageCount", "page_count")), hasNext: hasNext === true || lower(hasNext) === "true" };
}

function nextPageUrl(currentUrl, payload) {
  const info = extractPagination(payload);
  const url = new URL(currentUrl);
  if (info.nextCursor) { url.searchParams.set("cursor", info.nextCursor); return url.toString(); }
  if (info.page && ((info.totalPages && info.page < info.totalPages) || info.hasNext)) { url.searchParams.set("page", String(info.page + 1)); return url.toString(); }
  return null;
}

async function fetchAllCatalogPages(apiUrl, fetchImpl = fetch, { timeoutMs = 15000, maxPages = 500 } = {}) {
  const bySku = new Map();
  const duplicates = new Map();
  const visited = new Set();
  let url = apiUrl;
  let pageCount = 0;
  while (url) {
    if (visited.has(url)) throw Object.assign(new Error(`Catalog API pagination loop detected at ${url}`), { code: "CATALOG_API_PAGINATION_LOOP" });
    if (pageCount >= maxPages) throw Object.assign(new Error(`Catalog API exceeded ${maxPages} pages.`), { code: "CATALOG_API_PAGE_LIMIT" });
    visited.add(url);
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    collectSkuObjects(payload, bySku, duplicates);
    pageCount += 1;
    url = nextPageUrl(url, payload);
  }
  return { bySku, metadata: { pageCount, itemCount: bySku.size, duplicateSkuCount: duplicates.size, duplicateSkus: [...duplicates.keys()].sort() } };
}

function normalizedActualPackaging(actual) {
  if (!actual) return null;
  return { measureMode: lower(actual.packagingMeasureMode), sellUnit: lower(actual.packagingSellUnit), packageQuantity: numberOrNull(actual.packagingPackageQuantity), packageUnit: lower(actual.packagingPackageUnit), netQuantity: lower(actual.packagingMeasureMode) === "count_only" ? null : numberOrNull(actual.packagingNetQuantity), netUnit: lower(actual.packagingMeasureMode) === "count_only" ? null : lower(actual.packagingNetUnit) };
}

function staleOptionIssues(expected, options) {
  const issues = [];
  const canonicalType = lower(expected.productType || expected.legacyType);
  const canonicalFlavor = lower(expected.flavor);
  const canonicalColor = lower(expected.expectedColor || (["den", "trang"].includes(canonicalType) ? canonicalType : ""));
  for (const [key, canonical] of [["color", canonicalColor], ["Màu", canonicalColor], ["màu", canonicalColor], ["Loại", canonicalType], ["loại", canonicalType]]) {
    const current = lower(options[key]);
    if (current && canonical && current !== canonical) pushIssue(issues, "BLOCKED", "STALE_OPTION_MISMATCH", `Legacy option ${key} conflicts with canonical attributes for ${expected.canonicalSku}.`, { key, value: options[key] }, canonical);
  }
  for (const key of ["Hương vị", "hương vị"]) {
    const current = lower(options[key]);
    if (current && canonicalFlavor && current !== canonicalFlavor) pushIssue(issues, "BLOCKED", "STALE_OPTION_MISMATCH", `Legacy option ${key} conflicts with canonical flavor for ${expected.canonicalSku}.`, { key, value: options[key] }, canonicalFlavor);
  }
  return issues;
}

function evaluateRow(expected, actual, alias, apiItem) {
  const issues = [];
  if (!actual) { pushIssue(issues, "BLOCKED", "CANONICAL_SKU_MISSING", `Canonical SKU ${expected.canonicalSku} is missing.`, null, expected.canonicalSku); return { issues, status: "BLOCKED" }; }
  if (clean(actual.productKey) !== expected.targetParentKey) pushIssue(issues, "BLOCKED", "WRONG_PARENT", `SKU ${expected.canonicalSku} is attached to the wrong parent.`, actual.productKey, expected.targetParentKey);
  if (expected.parent?.brand && upper(actual.brand) !== upper(expected.parent.brand)) pushIssue(issues, "WARN", "WRONG_BRAND", `SKU ${expected.canonicalSku} parent brand differs from the manifest.`, actual.brand, expected.parent.brand);
  if (expected.parent?.name && upper(actual.productName) !== upper(expected.parent.name)) pushIssue(issues, "WARN", "PARENT_NAME_MISMATCH", `SKU ${expected.canonicalSku} parent name differs from the manifest.`, actual.productName, expected.parent.name);
  if (upper(actual.variantName) !== upper(expected.name)) pushIssue(issues, "WARN", "VARIANT_NAME_MISMATCH", `Variant name differs for ${expected.canonicalSku}.`, actual.variantName, expected.name);
  if (actual.priceMode !== "fixed" || !actual.isActive || !actual.isPublic || !actual.isOrderable || actual.variantStatus !== "active") pushIssue(issues, "BLOCKED", "VARIANT_NOT_ORDERABLE", `SKU ${expected.canonicalSku} is not an active public orderable fixed-price variant.`, { priceMode: actual.priceMode, status: actual.variantStatus, isActive: actual.isActive, isPublic: actual.isPublic, isOrderable: actual.isOrderable }, "fixed/active/true/true/true");
  if (!Number.isFinite(Number(actual.shopPrice)) || Number(actual.shopPrice) <= 0) pushIssue(issues, "BLOCKED", "INVALID_UNIT_PRICE", `SKU ${expected.canonicalSku} has no positive production unit price.`, actual.shopPrice, "> 0");
  const expectedPack = { measureMode: expected.measureMode, sellUnit: expected.sellUnit, packageQuantity: expected.packageQuantity, packageUnit: expected.packageUnit, netQuantity: expected.netQuantity, netUnit: expected.netUnit };
  const actualPack = normalizedActualPackaging(actual);
  if (!actualPack) pushIssue(issues, "BLOCKED", "PACKAGING_MISSING", `SKU ${expected.canonicalSku} has no packaging specification.`, null, expectedPack);
  else if (stableStringify(actualPack) !== stableStringify(expectedPack)) pushIssue(issues, "BLOCKED", "PACKAGING_MISMATCH", `Packaging differs for ${expected.canonicalSku}.`, actualPack, expectedPack);
  const options = isRecord(actual.options) ? actual.options : {};
  if (expected.measureMode === "count_only") {
    const stale = ["size", "weight", "volume", "capacity"].filter((key) => clean(options[key]));
    if (stale.length) pushIssue(issues, "BLOCKED", "COUNT_ONLY_HAS_MEASUREMENT", `COUNT_ONLY SKU ${expected.canonicalSku} retains measurement fields.`, stale, []);
  }
  if (expected.attributePolicy === "explicit" || expected.attributePolicy === "legacy_flavor_split") {
    if (upper(options.type) !== upper(expected.productType)) pushIssue(issues, "BLOCKED", "PRODUCT_TYPE_MISMATCH", `Product type is incorrect for ${expected.canonicalSku}.`, options.type || null, expected.productType);
    if (upper(options.flavor) !== upper(expected.flavor)) pushIssue(issues, "BLOCKED", clean(options.flavor) ? "FLAVOR_MISMATCH" : "MISSING_FLAVOR", `Flavor is incorrect for ${expected.canonicalSku}.`, options.flavor || null, expected.flavor);
    if (expected.measureKind && clean(options.measure_kind) && lower(options.measure_kind) !== expected.measureKind) pushIssue(issues, "WARN", "MEASURE_KIND_MISMATCH", `measure_kind conflicts with packaging for ${expected.canonicalSku}.`, options.measure_kind, expected.measureKind);
  } else if (expected.attributePolicy === "review_legacy" && expected.legacyType && !clean(options.flavor)) pushIssue(issues, "WARN", "TYPE_FLAVOR_LEGACY_AMBIGUOUS", `Legacy manifest has one type field and production has no separate flavor for ${expected.canonicalSku}.`, { type: options.type || null, flavor: options.flavor || null, manifestType: expected.legacyType }, "Manual productType/flavor classification");
  issues.push(...staleOptionIssues(expected, options));
  if (expected.legacySku) {
    if (!alias) pushIssue(issues, "BLOCKED", "LEGACY_ALIAS_MISSING", `Legacy alias ${expected.legacySku} is missing.`, null, expected.canonicalSku);
    else if (upper(alias.canonicalSku) !== upper(expected.canonicalSku) || alias.variantId !== actual.variantId) pushIssue(issues, "BLOCKED", "LEGACY_ALIAS_WRONG_TARGET", `Legacy alias ${expected.legacySku} resolves incorrectly.`, alias, { canonicalSku: expected.canonicalSku, variantId: actual.variantId });
  }
  if (Number(actual.recipeMismatchCount || 0) > 0) pushIssue(issues, "BLOCKED", "RECIPE_REFERENCE_MISMATCH", `Recipe references are inconsistent for ${expected.canonicalSku}.`, actual.recipeMismatchCount, 0);
  if (!apiItem) pushIssue(issues, "WARN", "API_SKU_MISSING", `SKU ${expected.canonicalSku} was not found after reading the complete catalog API.`, null, expected.canonicalSku);
  else if (expected.attributePolicy === "explicit" || expected.attributePolicy === "legacy_flavor_split") {
    const apiOptions = isRecord(apiItem.options) ? apiItem.options : apiItem;
    const apiType = apiOptions.type ?? apiItem.productType ?? null;
    const apiFlavor = apiOptions.flavor ?? apiItem.flavor ?? null;
    if (upper(apiType) !== upper(expected.productType) || upper(apiFlavor) !== upper(expected.flavor)) pushIssue(issues, "BLOCKED", "API_TYPE_FLAVOR_MISMATCH", `Catalog API type/flavor differs for ${expected.canonicalSku}.`, { type: apiType, flavor: apiFlavor }, { type: expected.productType, flavor: expected.flavor });
  }
  const status = issues.some((issue) => issue.severity === "BLOCKED") ? "BLOCKED" : issues.length ? "WARN" : "PASS";
  return { issues, status };
}

function summarize(rows) {
  const count = (predicate) => rows.filter(predicate).length;
  const issues = rows.flatMap((row) => row.issues.map((issue) => ({ ...issue, taskId: row.taskId, canonicalSku: row.canonicalSku })));
  const issueCount = (codes) => { const set = new Set(Array.isArray(codes) ? codes : [codes]); return issues.filter((issue) => set.has(issue.code)).length; };
  const taskIssues = new Map();
  for (const issue of issues.filter((item) => item.severity === "BLOCKED")) { if (!taskIssues.has(issue.taskId)) taskIssues.set(issue.taskId, new Set()); taskIssues.get(issue.taskId).add(issue.code); }
  return { totalSkusAudited: rows.length, passCount: count((row) => row.status === "PASS"), warnCount: count((row) => row.status === "WARN"), blockedCount: count((row) => row.status === "BLOCKED"), wrongParentCount: issueCount("WRONG_PARENT"), wrongBrandCount: issueCount("WRONG_BRAND"), typeFlavorErrorCount: issueCount(["PRODUCT_TYPE_MISMATCH", "FLAVOR_MISMATCH", "TYPE_FLAVOR_LEGACY_AMBIGUOUS", "API_TYPE_FLAVOR_MISMATCH", "STALE_OPTION_MISMATCH"]), missingFlavorCount: issueCount("MISSING_FLAVOR"), packagingErrorCount: issueCount(["PACKAGING_MISSING", "PACKAGING_MISMATCH", "COUNT_ONLY_HAS_MEASUREMENT"]), priceErrorCount: issueCount("INVALID_UNIT_PRICE"), priceReferenceMissingCount: rows.filter((row) => Number(row.current?.references?.priceRows || 0) === 0).length, aliasErrorCount: issueCount(["LEGACY_ALIAS_MISSING", "LEGACY_ALIAS_WRONG_TARGET"]), recipeMismatchCount: issueCount("RECIPE_REFERENCE_MISMATCH"), apiErrorCount: issueCount(["API_SKU_MISSING", "API_TYPE_FLAVOR_MISMATCH"]), staleOptionCount: issueCount("STALE_OPTION_MISMATCH"), correctionTasksProposed: [...taskIssues.entries()].map(([taskId, codes]) => ({ sourceTaskId: taskId, proposedTaskId: `${taskId}-CORRECTION-01`, issueCodes: [...codes].sort() })) };
}

function markdown(report) {
  const s = report.summary;
  const lines = ["# Full production catalog audit", "", `- Status: **${report.status}**`, `- Audit ID: \`${report.auditId}\``, `- Generated: \`${report.generatedAt}\``, `- Target: \`${report.target.host}/${report.target.database}\``, "- Production modified: **false**", "", "## Summary", "", `- Total SKU: ${s.totalSkusAudited}`, `- PASS: ${s.passCount}`, `- WARN: ${s.warnCount}`, `- BLOCKED: ${s.blockedCount}`, `- Wrong parent: ${s.wrongParentCount}`, `- Type/flavor issues: ${s.typeFlavorErrorCount}`, `- Missing flavor: ${s.missingFlavorCount}`, `- Packaging issues: ${s.packagingErrorCount}`, `- Invalid price issues: ${s.priceErrorCount}`, `- Missing price-reference rows (informational): ${s.priceReferenceMissingCount}`, `- Alias issues: ${s.aliasErrorCount}`, `- Recipe mismatches: ${s.recipeMismatchCount}`, `- Stale options: ${s.staleOptionCount}`, `- API pages/items/duplicates: ${report.api.pageCount}/${report.api.itemCount}/${report.api.duplicateSkuCount}`, "", "## Findings", "", "| Task | SKU | Status | Parent | Type | Flavor | Issue codes |", "|---|---|---|---|---|---|---|", ...report.rows.filter((row) => row.status !== "PASS").map((row) => `| ${row.taskId} | ${row.canonicalSku} | ${row.status} | ${row.current.productKey || ""} | ${row.current.options?.type || ""} | ${row.current.options?.flavor || ""} | ${row.issues.map((issue) => issue.code).join(", ")} |`), "", "## Proposed correction tasks", "", ...(s.correctionTasksProposed.length ? s.correctionTasksProposed.map((item) => `- \`${item.proposedTaskId}\`: ${item.issueCodes.join(", ")}`) : ["- None"]), "", "## Verification limits", "", "- Exact commercial source prices are private. Missing catalog_variant_prices rows are informational when fixed shop price is positive.", "- Packaging is the primary measure-kind source. Missing options.measure_kind is not an issue; a contradictory value is WARN.", "- The catalog API is read page-by-page before API_SKU_MISSING is emitted.", "- Correction proposals contain BLOCKED issues only.", "- The audit runs inside a PostgreSQL read-only transaction and performs no database write.", ""];
  return `${lines.join("\n")}\n`;
}

async function selfTest() {
  const base = { taskId: "SIRO-BATCH-TEST", canonicalSku: "TESTSKU", legacySku: "OLDTEST", name: "Siro Test Dâu", targetParentKey: "siro-test", parent: { name: "Siro Test", brand: "Test" }, attributePolicy: "legacy_flavor_split", productType: "siro", flavor: "dau", legacyType: "dau", measureKind: "mass", measureMode: "measured", sellUnit: "chai", packageQuantity: 12, packageUnit: "thùng", netQuantity: 1000, netUnit: "g", expectedColor: "" };
  const actual = { productKey: "siro-test", productName: "Siro Test", brand: "Test", variantId: "v1", variantName: "Siro Test Dâu", priceMode: "fixed", shopPrice: 10000, variantStatus: "active", isActive: true, isPublic: true, isOrderable: true, options: { type: "dau", size: "1000 g" }, packagingMeasureMode: "measured", packagingSellUnit: "chai", packagingPackageQuantity: 12, packagingPackageUnit: "thùng", packagingNetQuantity: 1000, packagingNetUnit: "g", priceRows: 0, recipeMismatchCount: 0 };
  const alias = { canonicalSku: "TESTSKU", variantId: "v1" };
  const bad = evaluateRow(base, actual, alias, { sku: "TESTSKU", options: actual.options });
  if (!bad.issues.some((issue) => issue.code === "PRODUCT_TYPE_MISMATCH") || !bad.issues.some((issue) => issue.code === "MISSING_FLAVOR")) throw new Error("Self-test did not detect legacy type/flavor collapse.");
  const fixedActual = { ...actual, options: { ...actual.options, type: "siro", flavor: "dau" } };
  const good = evaluateRow(base, fixedActual, alias, { sku: "TESTSKU", options: fixedActual.options });
  if (good.status !== "PASS") throw new Error(`Fixed price / packaging-derived measure expected PASS: ${JSON.stringify(good)}`);
  const warningOnly = summarize([{ taskId: "WARN-TASK", canonicalSku: "W1", status: "WARN", issues: [{ severity: "WARN", code: "API_SKU_MISSING" }], current: { references: { priceRows: 1 } } }]);
  if (warningOnly.correctionTasksProposed.length) throw new Error("WARN-only task was proposed for correction.");
  const staleExpected = { ...base, canonicalSku: "3QBBTR", legacySku: "", name: "3Q BIBI TRẮNG", attributePolicy: "review_legacy", legacyType: "trang", productType: "", flavor: "", expectedColor: "trang" };
  const staleActual = { ...fixedActual, variantName: "3Q BIBI TRẮNG", options: { type: "trang", color: "den", "Màu": "den" } };
  if (!evaluateRow(staleExpected, staleActual, null, { sku: "3QBBTR", options: staleActual.options }).issues.some((issue) => issue.code === "STALE_OPTION_MISMATCH")) throw new Error("Stale option mismatch was not detected.");
  const pages = [{ data: { items: [{ sku: "A" }] }, pagination: { page: 1, totalPages: 2 } }, { data: { items: [{ sku: "B" }] }, pagination: { page: 2, totalPages: 2 } }];
  const fakeFetch = async (url) => ({ ok: true, json: async () => pages[Number(new URL(url).searchParams.get("page") || 1) - 1] });
  const paged = await fetchAllCatalogPages("http://127.0.0.1/catalog", fakeFetch);
  if (paged.metadata.pageCount !== 2 || paged.metadata.itemCount !== 2) throw new Error("API pagination self-test failed.");
  console.log(JSON.stringify({ status: "FULL_PRODUCTION_CATALOG_AUDIT_SELF_TEST_PASS" }, null, 2));
}

export { argument, clean, upper, lower, numberOrNull, isRecord, readJson, csv, pushIssue, normalizeManifest, collectSkuObjects, extractPagination, nextPageUrl, fetchAllCatalogPages, normalizedActualPackaging, staleOptionIssues, evaluateRow, summarize, markdown, selfTest };
