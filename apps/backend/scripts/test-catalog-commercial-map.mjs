import assert from "node:assert/strict";
import {
  buildCommercialOptions,
  hashCatalogCommercialPayload,
  normalizeCatalogCommercialPayload,
} from "./catalog-commercial-map.mjs";

function payloadWith(rows) {
  const payload = {
    schemaVersion: 1,
    sourceKey: "fixture-commercial-map",
    rows,
  };
  return {
    ...payload,
    payloadHash: hashCatalogCommercialPayload(payload),
    sourceFile: "fixture.xlsx",
  };
}

function validRow(overrides = {}) {
  return {
    sku: "SKU-001",
    name: "Siro fixture",
    group: "Siro",
    status: "ready",
    measureMode: "measured",
    sellUnit: "chai",
    netQuantity: 750,
    netUnit: "ml",
    packageQuantity: 12,
    packageUnit: "thùng",
    unitPrice: 100000,
    derivedPackagePrice: 1200000,
    sourceRow: 2,
    sourceMatchStatus: "fixture",
    ...overrides,
  };
}

const normalized = normalizeCatalogCommercialPayload(payloadWith([validRow()]));
assert.equal(normalized.rows.length, 1);
assert.equal(normalized.rows[0].unitPrice, 100000);
assert.equal(normalized.rows[0].measureMode, "measured");
assert.deepEqual(buildCommercialOptions(normalized.rows[0]), {
  sell_unit: "chai",
  package: "12 chai / thùng",
  size: "750 ml",
});

const legacyMeasured = normalizeCatalogCommercialPayload(payloadWith([validRow({ measureMode: undefined })]));
assert.equal(legacyMeasured.rows[0].measureMode, "measured");

const countOnly = normalizeCatalogCommercialPayload(payloadWith([validRow({
  sku: "TEA-BOX-001",
  name: "Trà túi lọc fixture",
  group: "Trà",
  measureMode: "count_only",
  sellUnit: "hộp",
  netQuantity: null,
  netUnit: null,
  packageQuantity: 30,
  packageUnit: "thùng",
  unitPrice: 50000,
  derivedPackagePrice: 1500000,
})]));
assert.equal(countOnly.rows[0].measureMode, "count_only");
assert.equal(countOnly.rows[0].netQuantity, null);
assert.equal(countOnly.rows[0].netUnit, null);
assert.deepEqual(buildCommercialOptions(countOnly.rows[0]), {
  sell_unit: "hộp",
  package: "30 hộp / thùng",
  size: null,
});

assert.throws(
  () => normalizeCatalogCommercialPayload(payloadWith([validRow(), validRow()])),
  (error) => error?.code === "CATALOG_COMMERCIAL_DUPLICATE_SKU",
);

assert.throws(
  () => normalizeCatalogCommercialPayload(payloadWith([validRow({ netQuantity: 0 })])),
  (error) => error?.code === "CATALOG_COMMERCIAL_NUMBER_INVALID",
);

assert.throws(
  () => normalizeCatalogCommercialPayload(payloadWith([validRow({
    measureMode: "count_only",
    netQuantity: 1,
    netUnit: "g",
  })])),
  (error) => error?.code === "CATALOG_COMMERCIAL_COUNT_ONLY_NET_FIELDS_FORBIDDEN",
);

assert.throws(
  () => normalizeCatalogCommercialPayload(payloadWith([validRow({
    measureMode: "measured",
    netQuantity: null,
    netUnit: null,
  })])),
  (error) => error?.code === "CATALOG_COMMERCIAL_TEXT_REQUIRED",
);

assert.throws(
  () => normalizeCatalogCommercialPayload(payloadWith([validRow({ status: "review" })])),
  (error) => error?.code === "CATALOG_COMMERCIAL_ROW_NOT_READY",
);

assert.throws(
  () => normalizeCatalogCommercialPayload(payloadWith([validRow({ derivedPackagePrice: 999999 })])),
  (error) => error?.code === "CATALOG_COMMERCIAL_PACKAGE_PRICE_MISMATCH",
);

const tampered = payloadWith([validRow()]);
tampered.rows[0].unitPrice = 90000;
assert.throws(
  () => normalizeCatalogCommercialPayload(tampered),
  (error) => error?.code === "CATALOG_COMMERCIAL_HASH_MISMATCH",
);

console.log("Catalog commercial map validation tests passed.");
