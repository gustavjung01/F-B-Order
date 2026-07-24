import { createHash } from "node:crypto";

const MAX_ROWS = 1_000;
const MAX_TEXT_LENGTH = 240;
const ALLOWED_NET_UNITS = new Set(["g", "kg", "ml", "l", "cái"]);

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function text(value, field, { max = MAX_TEXT_LENGTH, lower = false } = {}) {
  const normalized = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!normalized) fail("CATALOG_COMMERCIAL_TEXT_REQUIRED", `${field} is required.`, { field });
  if (normalized.length > max) fail("CATALOG_COMMERCIAL_TEXT_TOO_LONG", `${field} is too long.`, { field, max });
  return lower ? normalized.toLocaleLowerCase("vi-VN") : normalized;
}

function positiveNumber(value, field, { integer = false, max = 1_000_000_000 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max || (integer && !Number.isSafeInteger(parsed))) {
    fail("CATALOG_COMMERCIAL_NUMBER_INVALID", `${field} must be a positive ${integer ? "integer" : "number"}.`, { field, value });
  }
  return parsed;
}

function optionalInteger(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail("CATALOG_COMMERCIAL_NUMBER_INVALID", `${field} must be a positive integer when provided.`, { field, value });
  }
  return parsed;
}

function normalizeRow(value, index) {
  if (!isRecord(value)) {
    fail("CATALOG_COMMERCIAL_ROW_INVALID", `Row ${index + 1} must be an object.`, { index });
  }

  const status = text(value.status, `rows[${index}].status`, { lower: true });
  if (status !== "ready") {
    fail("CATALOG_COMMERCIAL_ROW_NOT_READY", `Row ${index + 1} is not marked ready.`, { index, status });
  }

  const netUnit = text(value.netUnit, `rows[${index}].netUnit`, { lower: true });
  if (!ALLOWED_NET_UNITS.has(netUnit)) {
    fail("CATALOG_COMMERCIAL_NET_UNIT_UNSUPPORTED", `Row ${index + 1} has an unsupported net unit.`, { index, netUnit });
  }

  const row = {
    sku: text(value.sku, `rows[${index}].sku`, { max: 120 }),
    name: text(value.name, `rows[${index}].name`),
    group: text(value.group, `rows[${index}].group`),
    status,
    sellUnit: text(value.sellUnit, `rows[${index}].sellUnit`, { max: 80, lower: true }),
    netQuantity: positiveNumber(value.netQuantity, `rows[${index}].netQuantity`),
    netUnit,
    packageQuantity: positiveNumber(value.packageQuantity, `rows[${index}].packageQuantity`, { integer: true }),
    packageUnit: text(value.packageUnit, `rows[${index}].packageUnit`, { max: 80, lower: true }),
    unitPrice: positiveNumber(value.unitPrice, `rows[${index}].unitPrice`, { integer: true }),
    derivedPackagePrice: positiveNumber(value.derivedPackagePrice, `rows[${index}].derivedPackagePrice`, { integer: true }),
    sourceRow: optionalInteger(value.sourceRow, `rows[${index}].sourceRow`),
    sourceMatchStatus: typeof value.sourceMatchStatus === "string" ? value.sourceMatchStatus.trim().slice(0, 500) : "",
  };

  const expectedPackagePrice = Math.round(row.unitPrice * row.packageQuantity);
  if (row.derivedPackagePrice !== expectedPackagePrice) {
    fail(
      "CATALOG_COMMERCIAL_PACKAGE_PRICE_MISMATCH",
      `Row ${index + 1} derived package price does not equal unit price multiplied by package quantity.`,
      { index, expectedPackagePrice, actual: row.derivedPackagePrice },
    );
  }

  return row;
}

export function payloadCore(payload) {
  if (!isRecord(payload)) fail("CATALOG_COMMERCIAL_PAYLOAD_INVALID", "Payload must be an object.");
  return {
    schemaVersion: payload.schemaVersion,
    sourceKey: payload.sourceKey,
    rows: payload.rows,
  };
}

export function hashCatalogCommercialPayload(payload) {
  return createHash("sha256").update(stableStringify(payloadCore(payload))).digest("hex");
}

export function normalizeCatalogCommercialPayload(payload) {
  if (!isRecord(payload)) fail("CATALOG_COMMERCIAL_PAYLOAD_INVALID", "Payload must be an object.");
  if (payload.schemaVersion !== 1) {
    fail("CATALOG_COMMERCIAL_SCHEMA_UNSUPPORTED", "schemaVersion must be 1.", { schemaVersion: payload.schemaVersion });
  }

  const sourceKey = text(payload.sourceKey, "sourceKey", { max: 180 });
  const sourceFile = typeof payload.sourceFile === "string" ? payload.sourceFile.trim().slice(0, 500) : null;
  const suppliedHash = text(payload.payloadHash, "payloadHash", { max: 64, lower: true });
  if (!/^[0-9a-f]{64}$/.test(suppliedHash)) {
    fail("CATALOG_COMMERCIAL_HASH_INVALID", "payloadHash must be a lowercase SHA-256 hex digest.");
  }

  const computedHash = hashCatalogCommercialPayload(payload);
  if (computedHash !== suppliedHash) {
    fail("CATALOG_COMMERCIAL_HASH_MISMATCH", "payloadHash does not match the payload contents.", {
      suppliedHash,
      computedHash,
    });
  }

  if (!Array.isArray(payload.rows) || payload.rows.length < 1 || payload.rows.length > MAX_ROWS) {
    fail("CATALOG_COMMERCIAL_ROWS_INVALID", `rows must contain between 1 and ${MAX_ROWS} items.`);
  }

  const rows = payload.rows.map(normalizeRow);
  const seen = new Set();
  for (const row of rows) {
    const key = row.sku.toLocaleUpperCase("vi-VN");
    if (seen.has(key)) fail("CATALOG_COMMERCIAL_DUPLICATE_SKU", `Duplicate SKU ${row.sku}.`, { sku: row.sku });
    seen.add(key);
  }

  return {
    schemaVersion: 1,
    sourceKey,
    sourceFile,
    payloadHash: computedHash,
    rows,
  };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
}

export function buildCommercialOptions(row) {
  return {
    sell_unit: row.sellUnit,
    package: `${formatNumber(row.packageQuantity)} ${row.sellUnit} / ${row.packageUnit}`,
    size: `${formatNumber(row.netQuantity)} ${row.netUnit}`,
  };
}

export function buildCommercialRawSource(payload, row) {
  return {
    sourceKey: payload.sourceKey,
    sourceFile: payload.sourceFile,
    payloadHash: payload.payloadHash,
    sourceRow: row.sourceRow,
    sourceMatchStatus: row.sourceMatchStatus,
    derivedPackagePrice: row.derivedPackagePrice,
    derivedPackagePricePolicy: "reference_only_not_discount_tier",
  };
}
