import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
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
const manifestsDir = path.resolve(arg("manifests-dir", "F:/1_A_Disk_D/khuong-binh/bep-si/image/bepsi-link-mapper/bepsi_link_mapper/catalog-v2/r2-ready/manifests"));
const products = readJson(path.join(manifestsDir, "products.json"));
const variants = readJson(path.join(manifestsDir, "product-variants.json"));
const images = readJson(path.join(manifestsDir, "product-images.json"));
const version = readJson(path.join(manifestsDir, "catalog-version.json"));
const supplementBySku = loadCatalogV2Supplement(repoRoot);

assert(Array.isArray(products) && products.length === 188, `Expected 188 products, found ${products.length}.`);
assert(Array.isArray(variants) && variants.length === 275, `Expected 275 variants, found ${variants.length}.`);
assert(Array.isArray(images) && images.length === 269, `Expected 269 images, found ${images.length}.`);
assert(version.parentCardCount === 188 && version.variantCount === 275, "Invalid catalog-version counts.");
assert(new Set(products.map((row) => row.productKey)).size === 188, "Duplicate productKey.");
assert(new Set(variants.map((row) => row.variantKey)).size === 275, "Duplicate variantKey.");
assert(new Set(variants.map((row) => row.sku)).size === 275, "Duplicate SKU.");
assert(supplementBySku.size === 275, `Expected 275 supplement rows, found ${supplementBySku.size}.`);
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

assert(packageInfoCount === 275, `Expected package information for 275 variants, found ${packageInfoCount}.`);
assert(dealerPriceCount === 272, `Expected 272 dealer prices, found ${dealerPriceCount}.`);

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
assert(connectionString, "DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  max: 1,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
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
    ON CONFLICT (variant_key) DO UPDATE SET
      product_id = EXCLUDED.product_id, sku = EXCLUDED.sku, name = EXCLUDED.name,
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
  assert(counts.products === 188 && counts.variants === 275 && counts.market === 3 && counts.images === 269, `DB count mismatch: ${JSON.stringify(counts)}`);
  assert(counts.dealer_prices === 272 && counts.package_info === 275, `Commercial data mismatch: ${JSON.stringify(counts)}`);
  if (apply) await client.query("COMMIT"); else await client.query("ROLLBACK");
  console.log(JSON.stringify({
    phase: 5,
    status: apply ? "IMPORT_PASS" : "DRY_RUN_PASS",
    applied: apply,
    parentProducts: counts.products,
    variants: counts.variants,
    marketPriceVariants: counts.market,
    images: counts.images,
    dealerPrices: counts.dealer_prices,
    variantsWithPackageInfo: counts.package_info,
    variantsWithExactSize: counts.exact_sizes,
    variantsMissingExactSize: counts.variants - counts.exact_sizes,
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
