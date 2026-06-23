import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { getDb } from "../src/db/pool";

type CatalogCard = {
  productId: string;
  variantId: string;
  sku: string;
  brand: string | null;
  industryKey: string;
  priceMode: "fixed" | "market";
  price: number | null;
  priceLabel: string | null;
  sizeLabel: string | null;
  packageLabel: string | null;
  sellUnit: string | null;
  specificationLabel: string | null;
  pricing: {
    source: "dealer" | "market" | null;
    reason: string | null;
  };
};

async function main() {
  const db = getDb();
  const counts = await db.query<{
    products: number;
    variants: number;
    dealer_prices: number;
    retail_prices: number;
    package_info: number;
    exact_sizes: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM catalog_products
       WHERE catalog_version = 'hung-phat-v2' AND status = 'active')::int AS products,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND is_public = true
         AND status IN ('active', 'market_price'))::int AS variants,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND shop_price IS NOT NULL)::int AS dealer_prices,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND retail_price IS NOT NULL)::int AS retail_prices,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND (options ? 'size' OR options ? 'package' OR options ? 'sell_unit'))::int AS package_info,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND (options ? 'size' OR options ? 'weight' OR options ? 'volume' OR options ? 'capacity'))::int AS exact_sizes
  `);

  assert.equal(counts.rows[0]?.products, 188);
  assert.equal(counts.rows[0]?.variants, 275);
  assert.equal(counts.rows[0]?.dealer_prices, 272);
  assert.equal(counts.rows[0]?.retail_prices, 0);
  assert.equal(counts.rows[0]?.package_info, 275);
  assert.ok((counts.rows[0]?.exact_sizes ?? 0) > 0);
  assert.ok((counts.rows[0]?.exact_sizes ?? 0) < 275);

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
      products: CatalogCard[];
    };
    assert.equal(listBody.total, 188);
    assert.equal(listBody.products.length, 188);
    assert.equal(listBody.cardModel, "parent");
    assert.equal(new Set(listBody.products.map((item) => item.productId)).size, 188);
    assert.ok(listBody.products.every((item) => item.variantId && item.sku));
    assert.ok(listBody.products.every((item) => item.specificationLabel));

    const fixedCards = listBody.products.filter((item) => item.priceMode === "fixed");
    const marketCards = listBody.products.filter((item) => item.priceMode === "market");
    assert.ok(fixedCards.length > 0);
    assert.ok(fixedCards.every((item) => item.price !== null));
    assert.ok(fixedCards.every((item) => item.pricing.source === "dealer"));
    assert.ok(marketCards.every((item) => item.price === null && item.priceLabel === "Thời giá"));

    const firstBranded = listBody.products.find((item) => item.brand);
    assert.ok(firstBranded?.brand);
    const brandResponse = await fetch(`${baseUrl}/catalog/products?brand=${encodeURIComponent(firstBranded.brand)}&limit=500`);
    assert.equal(brandResponse.status, 200);
    const brandBody = await brandResponse.json() as { products: CatalogCard[] };
    assert.ok(brandBody.products.length > 0);
    assert.ok(brandBody.products.every((item) => item.brand === firstBranded.brand));

    const selectedVariantId = listBody.products[0].variantId;
    const detailResponse = await fetch(`${baseUrl}/catalog/products/${selectedVariantId}`);
    assert.equal(detailResponse.status, 200);
    const detailBody = await detailResponse.json() as {
      product: { id: string; productKey: string };
      optionGroups: Array<{ key: string; name: string; values: string[] }>;
      variants: CatalogCard[];
      selectedVariantId: string;
    };

    assert.ok(detailBody.product.id);
    assert.ok(detailBody.product.productKey);
    assert.ok(Array.isArray(detailBody.optionGroups));
    assert.ok(detailBody.optionGroups.every((group) => group.key && group.name && group.values.length > 1));
    assert.ok(detailBody.variants.length >= 1);
    assert.equal(detailBody.selectedVariantId, selectedVariantId);
    assert.ok(detailBody.variants.some((variant) => variant.variantId === selectedVariantId));

    console.log(`Catalog v2 API contract passed: 188 parent cards / 275 variants / 272 dealer prices / ${counts.rows[0]?.exact_sizes} exact sizes.`);
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
