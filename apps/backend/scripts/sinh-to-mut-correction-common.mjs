import {
  assert,
  clean,
  lower,
  packagingOf,
  stableStringify,
  upper,
} from "./catalog-remap-batch-common.mjs";

function normalizeCorrectionManifest(raw) {
  assert(raw?.schemaVersion === 1, "Correction manifest schemaVersion must be 1.", "CATALOG_CORRECTION_MANIFEST_SCHEMA_INVALID");
  assert(raw?.correctionModelVersion === 1, "correctionModelVersion must be 1.", "CATALOG_CORRECTION_MODEL_INVALID");
  assert(raw?.reviewApproval?.status === "APPROVED", "Correction manifest is not approved.", "CATALOG_CORRECTION_REVIEW_INVALID");

  const actions = new Set(["UPDATE_EXISTING", "REMAP"]);
  const parents = Object.entries(raw.targetParents || {}).map(([detailGroup, parent]) => ({
    ...parent,
    detailGroup,
    productKey: clean(parent.productKey),
    name: clean(parent.name),
    brand: clean(parent.brand),
  }));
  assert(parents.length > 0, "Correction target parents are required.", "CATALOG_CORRECTION_PARENTS_MISSING");

  const rows = (raw.rows || []).map((source, index) => {
    const action = upper(source.action);
    assert(actions.has(action), `Unsupported correction action ${action}.`, "CATALOG_CORRECTION_ACTION_INVALID");
    const row = {
      ...source,
      rowNo: Number(source.rowNo) || index + 1,
      action,
      legacySku: clean(source.legacySku),
      canonicalSku: clean(source.canonicalSku),
      name: clean(source.name),
      detailGroup: clean(source.detailGroup),
      targetParentKey: clean(source.targetParentKey),
      productType: clean(source.productType),
      flavor: clean(source.flavor),
      measureKind: lower(source.measureKind),
      ...packagingOf(source),
    };
    assert(row.canonicalSku && row.name && row.detailGroup && row.targetParentKey, `Correction row ${index + 1} is incomplete.`, "CATALOG_CORRECTION_ROW_INCOMPLETE");
    if (row.action === "REMAP") assert(row.legacySku, `REMAP ${row.canonicalSku} requires legacySku.`, "CATALOG_CORRECTION_LEGACY_REQUIRED");
    assert(row.productType && row.flavor && row.measureKind === "mass", `Correction ${row.canonicalSku} requires productType, flavor, and mass measureKind.`, "CATALOG_CORRECTION_ATTRIBUTES_INVALID");
    return row;
  });

  assert(rows.length === 25, `Correction manifest must contain 25 rows, found ${rows.length}.`, "CATALOG_CORRECTION_ROW_COUNT_INVALID");
  const canonical = rows.map((row) => upper(row.canonicalSku));
  const remapLegacy = rows.filter((row) => row.action === "REMAP").map((row) => upper(row.legacySku));
  assert(new Set(canonical).size === canonical.length, "Correction manifest has duplicate canonical SKUs.", "CATALOG_CORRECTION_CANONICAL_DUPLICATE");
  assert(new Set(remapLegacy).size === remapLegacy.length, "Correction manifest has duplicate remap legacy SKUs.", "CATALOG_CORRECTION_LEGACY_DUPLICATE");

  return {
    taskId: clean(raw.taskId),
    groupKey: clean(raw.groupKey),
    industryKey: clean(raw.industryKey),
    industryName: clean(raw.industryName),
    catalogGroupKey: clean(raw.catalogGroupKey),
    catalogGroupName: clean(raw.catalogGroupName),
    imagePolicy: raw.imagePolicy || {},
    parents,
    rows,
  };
}

function validateCorrectionCommercial(manifest, payload) {
  assert(payload.taskId === manifest.taskId, "Private payload taskId does not match correction manifest.", "CATALOG_CORRECTION_PAYLOAD_TASK_MISMATCH");
  assert(payload.rows.length === manifest.rows.length, "Private payload row count does not match correction manifest.", "CATALOG_CORRECTION_PAYLOAD_COUNT_MISMATCH");
  const bySku = new Map(payload.rows.map((row) => [upper(row.sku), row]));
  for (const expected of manifest.rows) {
    const row = bySku.get(upper(expected.canonicalSku));
    assert(row, `Private commercial row missing for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_MISSING");
    assert(upper(row.action) === expected.action, `Private action mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_ACTION_MISMATCH");
    assert(upper(row.legacySku) === upper(expected.legacySku), `Private legacy SKU mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_LEGACY_MISMATCH");
    assert(upper(row.group) === upper(manifest.catalogGroupName), `Private group mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_GROUP_MISMATCH");
    assert(upper(row.detailGroup) === upper(expected.detailGroup), `Private detail group mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_DETAIL_GROUP_MISMATCH");
    assert(upper(row.name) === upper(expected.name), `Private name mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_NAME_MISMATCH");
    assert(stableStringify(packagingOf(row)) === stableStringify(packagingOf(expected)), `Private packaging mismatch for ${expected.canonicalSku}.`, "CATALOG_CORRECTION_COMMERCIAL_PACKAGING_MISMATCH");
  }
  return bySku;
}

function csv(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export { csv, normalizeCorrectionManifest, validateCorrectionCommercial };
