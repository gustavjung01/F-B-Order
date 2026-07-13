import assert from "node:assert/strict";
import { evaluateCatalogOrderability } from "../src/modules/catalog/orderability-policy";

const readyPhysicalProduct = evaluateCatalogOrderability({
  productType: "physical",
  sku: "SMOKE-SKU-001",
  unitLabel: "Gói",
  isPublic: true,
  isActive: true,
  orderingEnabled: true,
  bundleItemCount: 0,
  invalidBundleItemCount: 0,
  sourceDataIssues: [
    "missing_sku",
    "missing_unit",
    "missing_price",
    "ordering_disabled",
  ],
  basePrice: 125000,
  wholesalePrice: 110000,
  priceGroupPrice: null,
});

assert.equal(readyPhysicalProduct.catalogEligible, true);
assert.equal(readyPhysicalProduct.dataIssues.includes("missing_sku"), false);
assert.equal(readyPhysicalProduct.dataIssues.includes("missing_unit"), false);
assert.equal(readyPhysicalProduct.dataIssues.includes("missing_price"), false);
assert.equal(readyPhysicalProduct.dataIssues.includes("ordering_disabled"), false);

const missingPrice = evaluateCatalogOrderability({
  productType: "physical",
  sku: "SMOKE-SKU-002",
  unitLabel: "Gói",
  isPublic: true,
  isActive: true,
  orderingEnabled: true,
  bundleItemCount: 0,
  invalidBundleItemCount: 0,
  sourceDataIssues: [],
  basePrice: 0,
  wholesalePrice: null,
  priceGroupPrice: null,
});

assert.equal(missingPrice.catalogEligible, false);
assert.equal(missingPrice.dataIssues.includes("missing_price"), true);

const disabledProduct = evaluateCatalogOrderability({
  productType: "physical",
  sku: "SMOKE-SKU-003",
  unitLabel: "Gói",
  isPublic: true,
  isActive: true,
  orderingEnabled: false,
  bundleItemCount: 0,
  invalidBundleItemCount: 0,
  sourceDataIssues: [],
  basePrice: 100000,
  wholesalePrice: null,
  priceGroupPrice: null,
});

assert.equal(disabledProduct.catalogEligible, false);
assert.equal(disabledProduct.dataIssues.includes("ordering_disabled"), true);

console.log("Admin product readiness contract tests passed.");
