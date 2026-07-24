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
assert.deepEqual(buildCommercialOptions(normalized.rows[0]), {
  sell_unit: "chai",
  package: "12 chai / thùng",
  size: "750 ml",
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
