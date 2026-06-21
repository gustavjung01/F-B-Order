import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { getDb } from "../src/db/pool";
import type { CustomerIdentity } from "../src/modules/auth/auth.identity";
import { createCatalogRouter } from "../src/modules/catalog/catalog.routes";
import { validateOrderProductAccess } from "../src/modules/catalog/order-access";
import { evaluateCatalogOrderability } from "../src/modules/catalog/orderability-policy";

const db = getDb();

const approvedIdentity: CustomerIdentity = {
  kind: "customer",
  clerkUserId: "catalog-contract-approved",
  customerId: "catalog-contract-customer",
  customerUserRole: "owner",
  approvalStatus: "approved",
  accountStatus: "active",
  priceGroupId: null,
};

async function isolateCatalogFixture() {
  await db.query("BEGIN");
  try {
    await db.query(`
      DELETE FROM cart_items
      WHERE product_id IN (
        SELECT id FROM products WHERE source_key <> 'hung-phat'
      )
    `);
    await db.query(`
      UPDATE order_items
      SET product_id = NULL
      WHERE product_id IN (
        SELECT id FROM products WHERE source_key <> 'hung-phat'
      )
    `);
    await db.query(`
      DELETE FROM product_bundle_items
      WHERE bundle_product_id IN (
        SELECT id FROM products WHERE source_key <> 'hung-phat'
      )
      OR component_product_id IN (
        SELECT id FROM products WHERE source_key <> 'hung-phat'
      )
    `);
    await db.query("DELETE FROM products WHERE source_key <> 'hung-phat'");
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function requestJson(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${path}, received ${contentType || "no content type"}: ${raw.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${path}: ${raw.slice(0, 200)}`);
  }

  try {
    return { status: response.status, body: JSON.parse(raw), raw };
  } catch (error) {
    throw new Error(`Invalid JSON from ${path}: ${raw.slice(0, 200)}`, { cause: error });
  }
}

async function main() {
  await isolateCatalogFixture();

  const app = express();
  app.use("/api/catalog", createCatalogRouter(async () => approvedIdentity));
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Catalog contract test server listen timeout"));
    }, 5000);

    server.once("listening", () => {
      clearTimeout(timeout);
      resolve();
    });
    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const categoriesResponse = await requestJson(baseUrl, "/api/catalog/categories");
    assert.equal(categoriesResponse.status, 200);
    assert.equal(categoriesResponse.body.total, 4);
    assert.deepEqual(
      categoriesResponse.body.categories.map((category: any) => category.id),
      ["tra-sua-pha-che", "mi-cay-han-quoc", "thuc-pham-dong-lanh", "combo-cong-thuc"],
    );

    const countByCategory = new Map(
      categoriesResponse.body.categories.map((category: any) => [category.id, category.productCount]),
    );
    assert.equal(countByCategory.get("tra-sua-pha-che"), 16);
    assert.equal(countByCategory.get("combo-cong-thuc"), 6);
    assert.equal(countByCategory.get("mi-cay-han-quoc"), 0);
    assert.equal(countByCategory.get("thuc-pham-dong-lanh"), 0);
    assert.equal(categoriesResponse.body.categories.every((category: any) => category.isActive === true), true);

    const listResponse = await requestJson(baseUrl, "/api/catalog/products?limit=100");
    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.total, 22);
    assert.equal(listResponse.body.products.length, 22);

    const physicalProducts = listResponse.body.products.filter(
      (product: any) => product.productType === "physical",
    );
    const bundles = listResponse.body.products.filter(
      (product: any) => product.productType === "bundle",
    );
    assert.equal(physicalProducts.length, 16);
    assert.equal(bundles.length, 6);

    const requiredFields = [
      "productType",
      "catalogKind",
      "isPublic",
      "isActive",
      "isOrderable",
      "catalogEligible",
      "priceVisibility",
      "bundleItemCount",
      "dataIssues",
      "pricing",
    ];

    for (const product of listResponse.body.products) {
      for (const field of requiredFields) {
        assert.equal(Object.hasOwn(product, field), true, `${product.slug} is missing ${field}`);
      }
      assert.equal(product.isPublic, true);
      assert.equal(product.isActive, true);
      assert.equal(Array.isArray(product.dataIssues), true);
      assert.equal(product.priceVisibility, product.pricing.visibility);
      assert.equal(Object.hasOwn(product, "basePrice"), false);
      assert.equal(Object.hasOwn(product, "wholesalePrice"), false);

      const detailResponse = await requestJson(
        baseUrl,
        `/api/catalog/products/${encodeURIComponent(product.slug)}`,
      );
      assert.equal(detailResponse.status, 200);
      assert.deepEqual(detailResponse.body.product, product);
    }

    for (const bundle of bundles) {
      assert.equal(bundle.catalogKind, "bundle_candidate");
      assert.equal(bundle.bundleItemCount, 0);
      assert.equal(bundle.catalogEligible, false);
      assert.equal(bundle.isOrderable, false);
      assert.equal(bundle.dataIssues.includes("missing_bundle_components"), true);
      assert.equal(bundle.dataIssues.includes("missing_sku"), true);
      assert.equal(bundle.dataIssues.includes("missing_unit"), true);
      assert.equal(bundle.dataIssues.includes("missing_price"), true);
    }

    const databaseCounts = await db.query<{
      physical_count: number;
      bundle_count: number;
      public_count: number;
      bundle_component_count: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE product_type = 'physical')::int AS physical_count,
        COUNT(*) FILTER (WHERE product_type = 'bundle')::int AS bundle_count,
        COUNT(*)::int AS public_count,
        (
          SELECT COUNT(*)::int
          FROM product_bundle_items bundle_item
          JOIN products bundle ON bundle.id = bundle_item.bundle_product_id
          WHERE bundle.source_key = 'hung-phat'
        ) AS bundle_component_count
      FROM products
      WHERE source_key = 'hung-phat'
        AND is_public = true
        AND is_active = true
        AND status IN ('active', 'needs_review')
    `);
    assert.deepEqual(databaseCounts.rows[0], {
      physical_count: 16,
      bundle_count: 6,
      public_count: 22,
      bundle_component_count: 0,
    });

    const validBundle = {
      productType: "bundle" as const,
      sku: "BUNDLE-VALID",
      unitLabel: "Combo",
      isPublic: true,
      isActive: true,
      orderingEnabled: true,
      bundleItemCount: 1,
      invalidBundleItemCount: 0,
      sourceDataIssues: ["missing_sku", "missing_unit", "missing_bundle_components"],
      basePrice: 100000,
      wholesalePrice: null,
      priceGroupPrice: null,
    };
    const validBundleOrderability = evaluateCatalogOrderability(validBundle);
    assert.equal(validBundleOrderability.catalogEligible, true);
    assert.equal(validBundleOrderability.dataIssues.includes("missing_sku"), false);
    assert.equal(validBundleOrderability.dataIssues.includes("missing_bundle_components"), false);

    const validBundleOrderAccess = validateOrderProductAccess(approvedIdentity, {
      ...validBundle,
      isOrderable: true,
      sourceDataIssues: validBundle.sourceDataIssues,
    });
    assert.deepEqual(validBundleOrderAccess, {
      allowed: true,
      unitPrice: 100000,
      currency: "VND",
      priceSource: "base",
    });

    const invalidComponentOrderAccess = validateOrderProductAccess(approvedIdentity, {
      ...validBundle,
      isOrderable: true,
      invalidBundleItemCount: 1,
    });
    assert.equal(invalidComponentOrderAccess.allowed, false);
    assert.equal(
      invalidComponentOrderAccess.allowed === false && invalidComponentOrderAccess.code,
      "BUNDLE_COMPONENTS_INVALID",
    );

    console.log("Catalog contract integration tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Catalog contract integration tests failed.");
  console.error(error instanceof Error ? error.stack : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
