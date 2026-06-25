import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { applyCatalogV2Metadata } from "./apply-catalog-v2-metadata.mjs";
import { loadCatalogV2Supplement } from "./catalog-v2-supplement.mjs";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const backendRoot = path.resolve(here, "..");
for (const envPath of [path.join(repoRoot, ".env"), path.join(backendRoot, ".env"), path.join(backendRoot, ".env.local")]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const arg = (name, fallback) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const slugify = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/đ/g, "d")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const positiveMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
};

const apply = process.argv.includes("--apply");
const allowRemoteApply = process.argv.includes("--allow-remote-apply");
const manifestsDir = path.resolve(arg(
  "manifests-dir",
  path.join(repoRoot, "data/catalog/hung-phat/v2/generated/manifests"),
));
const products = readJson(path.join(manifestsDir, "products.json"));
const variants = readJson(path.join(manifestsDir, "product-variants.json"));
const images = readJson(path.join(manifestsDir, "product-images.json"));
const version = readJson(path.join(manifestsDir, "catalog-version.json"));
const supplementBySku = loadCatalogV2Supplement(repoRoot);

const expectedProducts = Number(version.parentCardCount);
const expectedVariants = Number(version.variantCount);
const expectedImages = Number(version.mappedImageCount);
const expectedMarketPrices = Number(version.marketPriceCount);
const expectedDealerPrices = expectedVariants - expectedMarketPrices;

assert(version.catalogVersion === "hung-phat-v2", `Unexpected catalog version: ${version.catalogVersion}`);
assert(Number.isInteger(expectedProducts) && expectedProducts > 0, "Invalid parentCardCount in catalog-version.");
assert(Number.isInteger(expectedVariants) && expectedVariants > 0, "Invalid variantCount in catalog-version.");
assert(Number.isInteger(expectedImages) && expectedImages >= 0, "Invalid mappedImageCount in catalog-version.");
assert(Array.isArray(products) && products.length === expectedProducts, `Expected ${expectedProducts} products, found ${products.length}.`);
assert(Array.isArray(variants) && variants.length === expectedVariants, `Expected ${expectedVariants} variants, found ${variants.length}.`);
assert(Array.isArray(images) && images.length === expectedImages, `Expected ${expectedImages} images, found ${images.length}.`);
assert(new Set(products.map((row) => row.productKey)).size === expectedProducts, "Duplicate productKey.");
assert(new Set(variants.map((row) => row.variantKey)).size === expectedVariants, "Duplicate variantKey.");
assert(new Set(variants.map((row) => row.sku)).size === expectedVariants, "Duplicate SKU.");
assert(supplementBySku.size === expectedVariants, `Expected ${expectedVariants} supplement rows, found ${supplementBySku.size}.`);
const productKeys = new Set(products.map((row) => row.productKey));
assert(variants.every((row) => productKeys.has(row.parentKey)), "Orphan variant found.");
assert(variants.every((row) => supplementBySku.has(row.sku)), "Variant supplement is incomplete.");

const productPayload = products.map((row, sortOrder) => ({
  productKey: row.productKey,
  name: row.name,
  brand: row.brand || null,
  industry: row.industry,
  industryKey: slugify(row.industry),
  subcategory: row.subcategory || null,
  sourceGroup: row.sourceGroup || null,
  optionGroups: row.optionGroups || [],
  coverImageKey: row.imageKey || null,
  coverImageObjectKey: row.image?.objectKey || null,
  sortOrder,
}));

let dealerPriceCount = 0;
let packageInfoCount = 0;
let exactSizeCount = 0;
const variantPayload = variants.map((row, sortOrder) => {
  const supplement = supplementBySku.get(row.sku);
  const mergedOptions = {
    ...supplement.options,
    ...(row.options || {}),
  };
  const fixedPrice = row.priceMode === "fixed";
  const dealerPrice = fixedPrice
    ? positiveMoney(row.shopPrice) ?? supplement.dealerPrice
    : null;
  const hasPackageInfo = Boolean(
    mergedOptions.size || mergedOptions.package || mergedOptions.sell_unit,
  );
  const hasExactSize = Boolean(
    mergedOptions.size || mergedOptions.weight || mergedOptions.volume || mergedOptions.capacity,
  );

  if (dealerPrice !== null) dealerPriceCount += 1;
  if (hasPackageInfo) packageInfoCount += 1;
  if (hasExactSize) exactSizeCount += 1;

  return {
    parentKey: row.parentKey,
    variantKey: row.variantKey,
    sku: row.sku,
    name: row.name,
    options: mergedOptions,
    priceMode: row.priceMode,
    priceLabel: row.priceLabel || null,
    retailPrice: null,
    shopPrice: dealerPrice,
    imageKey: row.imageKey || null,
    imageObjectKey: row.image?.objectKey || null,
    status: row.status,
    isOrderable: fixedPrice && dealerPrice !== null,
    sortOrder,
  };
});

assert(packageInfoCount === expectedVariants, `Expected package information for ${expectedVariants} variants, found ${packageInfoCount}.`);
assert(dealerPriceCount === expectedDealerPrices, `Expected ${expectedDealerPrices} dealer prices, found ${dealerPriceCount}.`);

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured in apps/backend/.env.");
const targetUrl = new URL(connectionString);
const target = {
  host: targetUrl.hostname,
  port: targetUrl.port || "5432",
  database: targetUrl.pathname.replace(/^\//, ""),
};
const localConnection = ["localhost", "127.0.0.1", "::1"].includes(target.host);
if (apply) {
  assert(
    localConnection || allowRemoteApply,
    "Refusing to apply catalog v2 to Heroku/remote DB. Remote apply requires --allow-remote-apply after an explicit backup and approval.",
  );
}

const pool = new Pool({
  connectionString,
  ssl: localConnection ? false : { rejectUnauthorized: false },
  max: 1,
});
const client = await pool.connect();

try {
  if (!apply) {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(`SELECT
      to_regclass('public.catalog_products') IS NOT NULL AS has_products_table,
      to_regclass('public.catalog_variants') IS NOT NULL AS has_variants_table,
      CASE WHEN to_regclass('public.catalog_products') IS NOT NULL THEN
        (SELECT COUNT(*) FROM catalog_products WHERE catalog_version='hung-phat-v2' AND status='active')::int
      ELSE 0 END AS current_products,
      CASE WHEN to_regclass('public.catalog_variants') IS NOT NULL THEN
        (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND is_active)::int
      ELSE 0 END AS current_variants`);
    await client.query("ROLLBACK");
    const current = result.rows[0];
    assert(current.has_products_table, "Heroku DB is missing catalog_products.");
    assert(current.has_variants_table, "Heroku DB is missing catalog_variants.");
    console.log(JSON.stringify({
      phase: 5,
      status: "REMOTE_AUDIT_PASS",
      applied: false,
      target,
      manifest: {
        parentProducts: expectedProducts,
        variants: expectedVariants,
        images: expectedImages,
        marketPriceVariants: expectedMarketPrices,
        dealerPrices: expectedDealerPrices,
      },
      currentDatabase: {
        parentProducts: current.current_products,
        variants: current.current_variants,
      },
      note: "Read-only audit only. No catalog rows were inserted or updated.",
    }, null, 2));
  } else {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query(`
      INSERT INTO catalog_products (
        catalog_version, product_key, name, brand, industry, industry_key, subcategory,
        source_group, option_groups, cover_image_key, cover_image_object_key, status, sort_order
      )
      SELECT 'hung-phat-v2', x.product_key, x.name, x.brand, x.industry, x.industry_key,
        x.subcategory, x.source_group, x.option_groups, x.cover_image_key,
        x.cover_image_object_key, 'active', x.sort_order
      FROM jsonb_to_recordset($1::jsonb) AS x(
        product_key text, name text, brand text, industry text, industry_key text,
        subcategory text, source_group text, option_groups jsonb, cover_image_key text,
        cover_image_object_key text, sort_order integer
      )
      ON CONFLICT (product_key) DO UPDATE SET
        name = EXCLUDED.name, brand = EXCLUDED.brand, industry = EXCLUDED.industry,
        industry_key = EXCLUDED.industry_key, subcategory = EXCLUDED.subcategory,
        source_group = EXCLUDED.source_group, option_groups = EXCLUDED.option_groups,
        cover_image_key = EXCLUDED.cover_image_key,
        cover_image_object_key = EXCLUDED.cover_image_object_key,
        status = 'active', sort_order = EXCLUDED.sort_order, updated_at = now()
    `, [JSON.stringify(productPayload).replaceAll("productKey", "product_key").replaceAll("industryKey", "industry_key").replaceAll("sourceGroup", "source_group").replaceAll("optionGroups", "option_groups").replaceAll("coverImageKey", "cover_image_key").replaceAll("coverImageObjectKey", "cover_image_object_key").replaceAll("sortOrder", "sort_order")]);

    // SKU is the stable identity. Parent remapping can change variant_key,
    // so move current keys aside inside the same transaction before upserting.
    const rekeyResult = await client.query(`
      UPDATE catalog_variants
      SET variant_key = '__catalog_v2_rekey__' || id::text
      WHERE catalog_version = 'hung-phat-v2'
        AND sku = ANY($1::text[])
    `, [variants.map((row) => row.sku)]);
    assert(
      rekeyResult.rowCount === expectedVariants,
      `Expected to rekey ${expectedVariants} existing variants, found ${rekeyResult.rowCount}.`,
    );
    await client.query(`
      INSERT INTO catalog_variants (
        product_id, catalog_version, variant_key, sku, name, options, price_mode,
        price_label, retail_price, shop_price, image_key, image_object_key, status,
        is_active, is_public, is_orderable, sort_order
      )
      SELECT product.id, 'hung-phat-v2', x.variant_key, x.sku, x.name, x.options,
        x.price_mode, x.price_label, x.retail_price, x.shop_price, x.image_key,
        x.image_object_key, x.status, true, true, x.is_orderable, x.sort_order
      FROM jsonb_to_recordset($1::jsonb) AS x(
        parent_key text, variant_key text, sku text, name text, options jsonb,
        price_mode text, price_label text, retail_price numeric, shop_price numeric,
        image_key text, image_object_key text, status text, is_orderable boolean,
        sort_order integer
      )
      JOIN catalog_products product ON product.product_key = x.parent_key
      ON CONFLICT (sku) DO UPDATE SET
        product_id = EXCLUDED.product_id, variant_key = EXCLUDED.variant_key, name = EXCLUDED.name,
        options = EXCLUDED.options, price_mode = EXCLUDED.price_mode,
        price_label = EXCLUDED.price_label, retail_price = EXCLUDED.retail_price,
        shop_price = EXCLUDED.shop_price, image_key = EXCLUDED.image_key,
        image_object_key = EXCLUDED.image_object_key, status = EXCLUDED.status,
        is_active = true, is_public = true, is_orderable = EXCLUDED.is_orderable,
        sort_order = EXCLUDED.sort_order, updated_at = now()
    `, [JSON.stringify(variantPayload).replaceAll("parentKey", "parent_key").replaceAll("variantKey", "variant_key").replaceAll("priceMode", "price_mode").replaceAll("priceLabel", "price_label").replaceAll("retailPrice", "retail_price").replaceAll("shopPrice", "shop_price").replaceAll("imageKey", "image_key").replaceAll("imageObjectKey", "image_object_key").replaceAll("isOrderable", "is_orderable").replaceAll("sortOrder", "sort_order")]);

    await client.query("UPDATE catalog_variants SET is_active=false, is_public=false, status='inactive' WHERE catalog_version='hung-phat-v2' AND NOT (variant_key = ANY($1::text[]))", [variants.map((row) => row.variantKey)]);
    await client.query("UPDATE catalog_products SET status='inactive' WHERE catalog_version='hung-phat-v2' AND NOT (product_key = ANY($1::text[]))", [products.map((row) => row.productKey)]);
    const result = await client.query(`SELECT
      (SELECT COUNT(*) FROM catalog_products WHERE catalog_version='hung-phat-v2' AND status='active')::int AS products,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND is_active AND is_public AND status IN ('active','market_price'))::int AS variants,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND price_mode='market' AND is_active)::int AS market,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND image_object_key IS NOT NULL AND is_active)::int AS images,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND shop_price IS NOT NULL AND is_active)::int AS dealer_prices,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND (options ? 'size' OR options ? 'package' OR options ? 'sell_unit') AND is_active)::int AS package_info,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND (options ? 'size' OR options ? 'weight' OR options ? 'volume' OR options ? 'capacity') AND is_active)::int AS exact_sizes`);
    const counts = result.rows[0];
    assert(
      counts.products === expectedProducts
        && counts.variants === expectedVariants
        && counts.market === expectedMarketPrices
        && counts.images === expectedImages,
      `DB count mismatch: ${JSON.stringify(counts)}`,
    );
    assert(
      counts.dealer_prices === expectedDealerPrices && counts.package_info === expectedVariants,
      `Commercial data mismatch: ${JSON.stringify(counts)}`,
    );

    const metadata = await applyCatalogV2Metadata(client, repoRoot);
    const finalResult = await client.query(`SELECT
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND is_active AND is_public AND status IN ('active','market_price'))::int AS active_variants,
      (SELECT COUNT(*) FROM catalog_products WHERE catalog_version='hung-phat-v2' AND status='active' AND catalog_group_key IS NOT NULL)::int AS grouped_products,
      (SELECT COUNT(*) FROM catalog_products WHERE catalog_version='hung-phat-v2' AND status='active' AND jsonb_array_length(choice_groups) > 0)::int AS choice_products,
      (SELECT COUNT(*) FROM catalog_variants WHERE catalog_version='hung-phat-v2' AND sku=ANY($1::text[]) AND status='inactive' AND NOT is_active AND NOT is_public AND NOT is_orderable)::int AS disabled_variants`, [metadata.disabledSkus]);
    const finalCounts = finalResult.rows[0];
    assert(finalCounts.grouped_products === metadata.groups, `Catalog group metadata mismatch: ${JSON.stringify(finalCounts)}`);
    assert(finalCounts.choice_products === metadata.choices, `Catalog choice metadata mismatch: ${JSON.stringify(finalCounts)}`);
    assert(finalCounts.disabled_variants === metadata.disabledSkus.length, `Disabled metadata variant mismatch: ${JSON.stringify(finalCounts)}`);

    await client.query("COMMIT");
    console.log(JSON.stringify({
      phase: 5,
      status: "IMPORT_PASS",
      applied: true,
      target,
      parentProducts: counts.products,
      importedVariants: counts.variants,
      activeVariants: finalCounts.active_variants,
      marketPriceVariants: counts.market,
      images: counts.images,
      dealerPrices: counts.dealer_prices,
      variantsWithPackageInfo: counts.package_info,
      variantsWithExactSize: counts.exact_sizes,
      variantsMissingExactSize: counts.variants - counts.exact_sizes,
      metadata,
    }, null, 2));
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
