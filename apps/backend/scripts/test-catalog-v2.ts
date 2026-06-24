import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app";
import { getDb } from "../src/db/pool";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const version = JSON.parse(fs.readFileSync(
  path.join(repoRoot, "data/catalog/hung-phat/v2/generated/manifests/catalog-version.json"),
  "utf8",
)) as {
  parentCardCount: number;
  variantCount: number;
  mappedImageCount: number;
  marketPriceCount: number;
};
const expectedProducts = Number(version.parentCardCount);
const expectedVariants = Number(version.variantCount);
const expectedImages = Number(version.mappedImageCount);
const expectedMarketPrices = Number(version.marketPriceCount);
const expectedDealerPrices = expectedVariants - expectedMarketPrices;

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
  assert.ok(Number.isInteger(expectedProducts) && expectedProducts > 0);
  assert.ok(Number.isInteger(expectedVariants) && expectedVariants > 0);

  const db = getDb();
  const counts = await db.query<{
    products: number;
    variants: number;
    images: number;
    market_prices: number;
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
         AND image_object_key IS NOT NULL)::int AS images,
      (SELECT COUNT(*) FROM catalog_variants
       WHERE catalog_version = 'hung-phat-v2'
         AND is_active = true
         AND price_mode = 'market')::int AS market_prices,
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

  assert.equal(counts.rows[0]?.products, expectedProducts);
  assert.equal(counts.rows[0]?.variants, expectedVariants);
  assert.equal(counts.rows[0]?.images, expectedImages);
  assert.equal(counts.rows[0]?.market_prices, expectedMarketPrices);
  assert.equal(counts.rows[0]?.dealer_prices, expectedDealerPrices);
  assert.equal(counts.rows[0]?.retail_prices, 0);
  assert.equal(counts.rows[0]?.package_info, expectedVariants);
  assert.ok((counts.rows[0]?.exact_sizes ?? 0) > 0);
  assert.ok((counts.rows[0]?.exact_sizes ?? 0) < expectedVariants);

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
    assert.equal(listBody.total, expectedProducts);
    assert.equal(listBody.products.length, expectedProducts);
    assert.equal(listBody.cardModel, "parent");
    assert.equal(new Set(listBody.products.map((item) => item.productId)).size, expectedProducts);
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

    console.log(`Catalog v2 API contract passed: ${expectedProducts} parent cards / ${expectedVariants} variants / ${expectedDealerPrices} dealer prices / ${counts.rows[0]?.exact_sizes} exact sizes.`);
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
