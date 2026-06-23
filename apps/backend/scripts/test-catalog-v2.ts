import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { getDb } from "../src/db/pool";

async function main() {
  const db = getDb();
  const counts = await db.query<{
    products: number;
    variants: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM catalog_products
       WHERE catalog_version = 'hung-phat-v2' AND status = 'active')::int AS products,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND is_public = true
         AND status IN ('active', 'market_price'))::int AS variants
  `);

  assert.equal(counts.rows[0]?.products, 188);
  assert.equal(counts.rows[0]?.variants, 275);

  const app = createApp({
    port: 0,
    serviceName: "catalog-v2-contract-test",
    corsOrigin: "http://localhost:3000",
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const listResponse = await fetch(`${baseUrl}/catalog/products?limit=500`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json() as {
      total: number;
      cardModel: string;
      products: Array<{ variantId: string; sku: string }>;
    };
    assert.equal(listBody.total, 275);
    assert.equal(listBody.products.length, 275);
    assert.equal(listBody.cardModel, "variant");
    assert.ok(listBody.products.every((item) => item.variantId && item.sku));

    const selectedVariantId = listBody.products[0].variantId;
    const detailResponse = await fetch(`${baseUrl}/catalog/products/${selectedVariantId}`);
    assert.equal(detailResponse.status, 200);
    const detailBody = await detailResponse.json() as {
      product: { id: string; productKey: string };
      optionGroups: unknown[];
      variants: Array<{ variantId: string; sku: string; image: unknown; pricing: unknown }>;
      selectedVariantId: string;
    };

    assert.ok(detailBody.product.id);
    assert.ok(detailBody.product.productKey);
    assert.ok(Array.isArray(detailBody.optionGroups));
    assert.ok(Array.isArray(detailBody.variants));
    assert.ok(detailBody.variants.length >= 1);
    assert.equal(detailBody.selectedVariantId, selectedVariantId);
    assert.ok(detailBody.variants.some((variant) => variant.variantId === selectedVariantId));
    assert.ok(detailBody.variants.every((variant) => variant.variantId && variant.sku));

    console.log("Catalog v2 API contract passed: 188 parents / 275 variant cards.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await db.end();
  }
}

main().catch(async (error) => {
  console.error("Catalog v2 API contract failed.");
  console.error(error instanceof Error ? error.stack : error);
  await getDb().end().catch(() => undefined);
  process.exitCode = 1;
});
