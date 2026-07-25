import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const arg = (name, fallback = null) => process.argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const upper = (v) => clean(v).toLocaleUpperCase("vi-VN");
const lower = (v) => clean(v).toLocaleLowerCase("vi-VN");
const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
const isRecord = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const assert = (condition, message, code = "CATALOG_REMAP_BATCH_FAILED", details = undefined) => {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
};
const stableValue = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};
const stableStringify = (value) => JSON.stringify(stableValue(value));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
const readJson = (p, label) => {
  assert(p && fs.existsSync(p), `${label} is missing: ${p}`, "CATALOG_REMAP_FILE_MISSING");
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
};
const formatNumber = (value) => Number.isInteger(Number(value)) ? String(Number(value)) : String(Number(value));
const measureModeOf = (row) => lower(row?.measureMode) === "count_only" || (!positive(row?.netQuantity) && !clean(row?.netUnit)) ? "count_only" : "measured";
const packagingOf = (row) => {
  const mode = measureModeOf(row);
  return {
    measureMode: mode,
    sellUnit: lower(row?.sellUnit),
    packageQuantity: positive(row?.packageQuantity),
    packageUnit: lower(row?.packageUnit),
    netQuantity: mode === "measured" ? positive(row?.netQuantity) : null,
    netUnit: mode === "measured" ? lower(row?.netUnit) : null,
  };
};
const buildOptions = (oldOptions, row) => {
  const next = isRecord(oldOptions) ? { ...oldOptions } : {};
  for (const key of ["size", "weight", "volume", "capacity"]) delete next[key];
  const packaging = packagingOf(row);
  if (clean(row?.type)) next.type = clean(row.type);
  next.sell_unit = packaging.sellUnit;
  next.package = `${formatNumber(packaging.packageQuantity)} ${packaging.sellUnit} / ${packaging.packageUnit}`;
  if (packaging.measureMode === "measured") next.size = `${formatNumber(packaging.netQuantity)} ${packaging.netUnit}`;
  return next;
};
const csv = (value) => {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function verifyCommercialHash(raw) {
  const supplied = lower(raw?.payloadHash);
  assert(/^[0-9a-f]{64}$/.test(supplied), "Commercial payloadHash is invalid.", "CATALOG_REMAP_PAYLOAD_HASH_INVALID");
  const candidates = [
    { profile: "standard", value: { schemaVersion: raw.schemaVersion, sourceKey: raw.sourceKey, rows: raw.rows } },
    { profile: "batch-legacy", value: { schemaVersion: raw.schemaVersion, taskId: raw.taskId, sourceKey: raw.sourceKey, sourceFile: raw.sourceFile, rows: raw.rows, generatedAt: raw.generatedAt } },
  ];
  const match = candidates.find((candidate) => sha256(candidate.value) === supplied);
  assert(match, "Commercial payloadHash does not match payload contents.", "CATALOG_REMAP_PAYLOAD_HASH_MISMATCH", {
    supplied,
    computed: candidates.map((candidate) => ({ profile: candidate.profile, hash: sha256(candidate.value) })),
  });
  return { payloadHash: supplied, hashProfile: match.profile };
}

function normalizeCommercial(raw) {
  assert(raw?.schemaVersion === 1, "Commercial payload schemaVersion must be 1.", "CATALOG_REMAP_PAYLOAD_SCHEMA_INVALID");
  assert(Array.isArray(raw.rows) && raw.rows.length > 0, "Commercial payload rows are required.", "CATALOG_REMAP_PAYLOAD_ROWS_INVALID");
  const hash = verifyCommercialHash(raw);
  const rows = raw.rows.map((source, index) => {
    const sku = clean(source.sku || source.canonicalSku);
    const mode = measureModeOf(source);
    const packageQuantity = positive(source.packageQuantity);
    const unitPrice = positive(source.unitPrice);
    const derivedPackagePrice = positive(source.derivedPackagePrice);
    assert(sku, `Commercial row ${index + 1} has no SKU.`, "CATALOG_REMAP_PAYLOAD_SKU_MISSING");
    assert(lower(source.status) === "ready", `Commercial row ${sku} is not ready.`, "CATALOG_REMAP_PAYLOAD_ROW_NOT_READY");
    assert(clean(source.name) && clean(source.group), `Commercial row ${sku} is incomplete.`, "CATALOG_REMAP_PAYLOAD_ROW_INCOMPLETE");
    assert(clean(source.sellUnit) && packageQuantity && clean(source.packageUnit), `Commercial row ${sku} has invalid packaging.`, "CATALOG_REMAP_PAYLOAD_PACKAGING_INVALID");
    if (mode === "measured") assert(positive(source.netQuantity) && clean(source.netUnit), `Commercial row ${sku} has invalid measured fields.`, "CATALOG_REMAP_PAYLOAD_MEASURED_INVALID");
    if (mode === "count_only") assert(!positive(source.netQuantity) && !clean(source.netUnit), `Commercial row ${sku} must omit net fields.`, "CATALOG_REMAP_PAYLOAD_COUNT_ONLY_INVALID");
    assert(unitPrice && derivedPackagePrice === Math.round(unitPrice * packageQuantity), `Commercial row ${sku} has invalid price math.`, "CATALOG_REMAP_PAYLOAD_PRICE_INVALID");
    return {
      sku,
      name: clean(source.name),
      group: clean(source.group),
      detailGroup: clean(source.detailGroup),
      action: clean(source.action),
      legacySku: clean(source.legacySku),
      status: "ready",
      measureMode: mode,
      sellUnit: lower(source.sellUnit),
      packageQuantity,
      packageUnit: lower(source.packageUnit),
      netQuantity: mode === "measured" ? positive(source.netQuantity) : null,
      netUnit: mode === "measured" ? lower(source.netUnit) : null,
      unitPrice,
      derivedPackagePrice,
      sourceRow: positive(source.sourceRow),
      sourceMatchStatus: clean(source.sourceMatchStatus || source.sourceDecision),
    };
  });
  const seen = new Set();
  for (const row of rows) {
    const key = upper(row.sku);
    assert(!seen.has(key), `Duplicate commercial SKU ${row.sku}.`, "CATALOG_REMAP_PAYLOAD_DUPLICATE_SKU");
    seen.add(key);
  }
  return {
    schemaVersion: 1,
    taskId: clean(raw.taskId),
    sourceKey: clean(raw.sourceKey),
    sourceFile: clean(raw.sourceFile) || null,
    payloadHash: hash.payloadHash,
    hashProfile: hash.hashProfile,
    rows,
  };
}

function normalizeManifest(raw) {
  assert([1, 2].includes(raw?.schemaVersion), "Manifest schemaVersion must be 1 or 2.", "CATALOG_REMAP_MANIFEST_SCHEMA_INVALID");
  const common = {
    schemaVersion: raw.schemaVersion,
    taskId: clean(raw.taskId),
    groupKey: clean(raw.groupKey),
    industryKey: clean(raw.industryKey),
    industryName: clean(raw.industryName),
    catalogGroupKey: clean(raw.catalogGroupKey),
    catalogGroupName: clean(raw.catalogGroupName),
    imageMigrationPolicy: raw.imageMigrationPolicy || {},
    requiredMigrations: Array.isArray(raw.requiredMigrations) ? raw.requiredMigrations : [],
  };
  assert(common.taskId && common.groupKey && common.industryKey && common.catalogGroupKey, "Manifest identity is incomplete.", "CATALOG_REMAP_MANIFEST_IDENTITY_INVALID");
  let parents;
  let rows;
  if (raw.schemaVersion === 1) {
    assert(raw.auditVerification?.status === "AUDIT_PASS" && raw.auditVerification?.productionModified === false, "Schema 1 manifest audit is not approved.", "CATALOG_REMAP_MANIFEST_AUDIT_INVALID");
    assert(raw.dryRunVerification?.status === "DRY_RUN_PASS" && raw.dryRunVerification?.productionModified === false && raw.dryRunVerification?.canApplyAfterMigration === true, "Schema 1 manifest dry-run is not approved.", "CATALOG_REMAP_MANIFEST_DRY_RUN_INVALID");
    const detailGroup = clean(raw.detailGroup);
    parents = [{ ...raw.targetParent, detailGroup }];
    rows = (raw.rows || []).map((row, index) => ({ ...row, rowNo: index + 1, action: "REMAP", detailGroup, targetParentKey: raw.targetParent?.productKey }));
  } else {
    assert(raw.reviewApproval?.status === "APPROVED", "Schema 2 manifest review is not approved.", "CATALOG_REMAP_MANIFEST_REVIEW_INVALID");
    parents = Object.entries(raw.targetParents || {}).map(([detailGroup, parent]) => ({ ...parent, detailGroup }));
    rows = raw.rows || [];
  }
  assert(parents.length > 0 && rows.length > 0, "Manifest parents and rows are required.", "CATALOG_REMAP_MANIFEST_ROWS_INVALID");
  const normalizedRows = rows.map((row, index) => {
    const action = upper(row.action || "REMAP");
    assert(["REMAP", "CREATE_NEW"].includes(action), `Manifest row ${index + 1} action is invalid.`, "CATALOG_REMAP_MANIFEST_ACTION_INVALID");
    const result = {
      ...row,
      rowNo: Number(row.rowNo) || index + 1,
      action,
      legacySku: clean(row.legacySku),
      canonicalSku: clean(row.canonicalSku),
      name: clean(row.name),
      detailGroup: clean(row.detailGroup),
      targetParentKey: clean(row.targetParentKey),
      type: clean(row.type),
      ...packagingOf(row),
    };
    assert(result.canonicalSku && result.name && result.detailGroup && result.targetParentKey, `Manifest row ${index + 1} is incomplete.`, "CATALOG_REMAP_MANIFEST_ROW_INCOMPLETE");
    if (action === "REMAP") assert(result.legacySku, `REMAP ${result.canonicalSku} needs legacySku.`, "CATALOG_REMAP_MANIFEST_LEGACY_MISSING");
    if (action === "CREATE_NEW") assert(!result.legacySku, `CREATE_NEW ${result.canonicalSku} cannot have legacySku.`, "CATALOG_REMAP_MANIFEST_CREATE_HAS_LEGACY");
    return result;
  });
  const canonical = normalizedRows.map((row) => upper(row.canonicalSku));
  const legacy = normalizedRows.filter((row) => row.action === "REMAP").map((row) => upper(row.legacySku));
  assert(new Set(canonical).size === canonical.length && new Set(legacy).size === legacy.length, "Manifest contains duplicate SKUs.", "CATALOG_REMAP_MANIFEST_DUPLICATE_SKU");
  return { ...common, parents, rows: normalizedRows, manifestHash: sha256(raw), raw };
}

function commercialRowMap(payload) {
  return new Map(payload.rows.map((row) => [upper(row.sku), row]));
}

function validateManifestCommercial(manifest, payload) {
  const bySku = commercialRowMap(payload);
  for (const row of manifest.rows) {
    const commercial = bySku.get(upper(row.canonicalSku));
    assert(commercial, `Commercial row missing for ${row.canonicalSku}.`, "CATALOG_REMAP_COMMERCIAL_ROW_MISSING");
    assert(upper(commercial.group) === upper(manifest.catalogGroupName), `Commercial group mismatch for ${row.canonicalSku}.`, "CATALOG_REMAP_COMMERCIAL_GROUP_MISMATCH");
    if (commercial.detailGroup) assert(upper(commercial.detailGroup) === upper(row.detailGroup), `Commercial detail group mismatch for ${row.canonicalSku}.`, "CATALOG_REMAP_COMMERCIAL_DETAIL_GROUP_MISMATCH");
    if (commercial.action) assert(upper(commercial.action) === row.action, `Commercial action mismatch for ${row.canonicalSku}.`, "CATALOG_REMAP_COMMERCIAL_ACTION_MISMATCH");
    if (commercial.legacySku) assert(upper(commercial.legacySku) === upper(row.legacySku), `Commercial legacy SKU mismatch for ${row.canonicalSku}.`, "CATALOG_REMAP_COMMERCIAL_LEGACY_MISMATCH");
    assert(stableStringify(packagingOf(commercial)) === stableStringify(packagingOf(row)), `Commercial packaging mismatch for ${row.canonicalSku}.`, "CATALOG_REMAP_COMMERCIAL_PACKAGING_MISMATCH");
  }
  return bySku;
}

export { repoRoot, arg, clean, upper, lower, positive, isRecord, assert, stableStringify, sha256, readJson, formatNumber, measureModeOf, packagingOf, buildOptions, csv, normalizeCommercial, normalizeManifest, commercialRowMap, validateManifestCommercial };
