import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const backendRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "apps/frontend/data/catalog/hung-phat-catalog.ts");
const SOURCE_KEY = "hung-phat";

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(backendRoot, ".env"),
  path.join(backendRoot, ".env.local"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const connectionString = process.env.DATABASE_URL || process.env.BEPSI_DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or BEPSI_DATABASE_URL is not configured.");
  process.exit(1);
}

const imageUrlByProductId = {
  "tra-ona": "https://cdn.bepsi.click/catalog/hung-phat/products/tra-ona.jpg",
  "tra-loc-phat": "https://cdn.bepsi.click/catalog/hung-phat/products/tra-loc-phat.jpg",
  "tra-pha-may-2025": "https://cdn.bepsi.click/catalog/hung-phat/products/tra-pha-may-2025.jpg",
  "tra-oolong-sen": "https://cdn.bepsi.click/catalog/hung-phat/products/tra-oolong-sen.jpg",
  "bot-sua-sawasdee-1kg": "https://cdn.bepsi.click/catalog/hung-phat/products/bot-sua-sawasdee-1kg.jpg",
  "bot-sua-sumi": "https://cdn.bepsi.click/catalog/hung-phat/products/bot-sua-sumi.jpg",
  "bot-magisea-25kg": "https://cdn.bepsi.click/catalog/hung-phat/products/bot-magisea-25kg.jpg",
  "tran-chau-5s-dai-loan": "https://cdn.bepsi.click/catalog/hung-phat/products/tran-chau-5s-dai-loan.jpg",
  "tran-chau-olong": "https://cdn.bepsi.click/catalog/hung-phat/products/tran-chau-olong.jpg",
  "tran-chau-3q-sumi": "https://cdn.bepsi.click/catalog/hung-phat/products/tran-chau-3q-sumi.jpg",
  "bot-pudding-sumi": "https://cdn.bepsi.click/catalog/hung-phat/products/bot-pudding-sumi.jpg",
  "syrup-prince": "https://cdn.bepsi.click/catalog/hung-phat/products/syrup-prince.jpg",
  "dao-ngam-duong-prince": "https://cdn.bepsi.click/catalog/hung-phat/products/dao-ngam-duong-prince.jpg",
  "nuoc-cot-dua-sumi": "https://cdn.bepsi.click/catalog/hung-phat/products/nuoc-cot-dua-sumi.jpg",
  "barismate-nguyen-lieu-da-xay": "https://cdn.bepsi.click/catalog/hung-phat/products/barismate-nguyen-lieu-da-xay.jpg",
  "barismate-nguyen-lieu-tra-sua": "https://cdn.bepsi.click/catalog/hung-phat/products/barismate-nguyen-lieu-tra-sua.jpg",
  "combo-12-cong-thuc-tra-trai-cay-loc-phat": "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes/cover-combo-12-cong-thuc-tra-trai-cay-loc-phat.jpg",
  "combo-15-cong-thuc-tra-trai-cay": "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes/cover-combo-15-cong-thuc-tra-trai-cay.jpg",
  "combo-10-cong-thuc-tra-sua-chuan-gu": "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes/cover-combo-10-cong-thuc-tra-sua-chuan-gu.jpg",
  "combo-10-cong-thuc-de-pha-de-ban-loc-phat": "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes/cover-combo-10-cong-thuc-de-pha-de-ban-loc-phat.jpg",
  "combo-5-cong-thuc-uong-nong-noel": "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes/cover-combo-5-cong-thuc-uong-nong-noel.jpg",
  "solution-tra-pha-may-2025": "https://cdn.bepsi.click/catalog/hung-phat/covers/recipes/cover-solution-tra-pha-may-2025.jpg",
};

function parseCatalogSource() {
  const source = fs.readFileSync(sourcePath, "utf8");
  const marker = "export const hungPhatCatalog = ";
  const start = source.indexOf(marker);
  const end = source.lastIndexOf(" as const;");

  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Cannot locate hungPhatCatalog JSON object.");
  }

  return JSON.parse(source.slice(start + marker.length, end).trim());
}

function publicCategoryName(category) {
  return category.id === "combo-cong-thuc" ? "Combo gợi ý" : category.name;
}

function isBundleSource(product) {
  return product.catalogKind === "content" || product.catalogKind === "bundle_candidate";
}

function normalizeImportedProduct(product) {
  const isBundle = isBundleSource(product);
  const dataIssues = new Set(product.dataIssues || []);

  if (isBundle) {
    dataIssues.delete("missing_related_product_or_brand");
    dataIssues.add("missing_bundle_components");
    dataIssues.add("missing_sku");
    dataIssues.add("missing_price_retail");
    dataIssues.add("missing_price_wholesale");
  }

  return {
    ...product,
    productType: isBundle ? "bundle" : "physical",
    catalogKind: isBundle ? "bundle_candidate" : "sku_candidate",
    dataIssues: [...dataIssues],
    isOrderable: false,
  };
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
  max: 1,
});

const catalog = parseCatalogSource();
const client = await pool.connect();

try {
  await client.query("BEGIN");

  const rootCategories = catalog.categories.filter((category) => category.parentId === null);
  const childCategories = catalog.categories.filter((category) => category.parentId !== null);

  for (const category of rootCategories) {
    await client.query(`
      INSERT INTO categories (name, slug, sort_order, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = now()
    `, [publicCategoryName(category), category.id, category.sortOrder]);
  }

  for (const category of childCategories) {
    await client.query(`
      INSERT INTO categories (parent_id, name, slug, sort_order, is_active)
      SELECT parent.id, $1, $2, $3, true
      FROM categories parent
      WHERE parent.slug = $4
      ON CONFLICT (slug) DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        updated_at = now()
    `, [category.name, category.id, category.sortOrder, category.parentId]);
  }

  await client.query(
    "UPDATE products SET is_active = false, status = 'inactive' WHERE source_key = $1",
    [SOURCE_KEY],
  );

  const productRows = catalog.products
    .filter((product) => product.catalogKind !== "category_scaffold")
    .map(normalizeImportedProduct);

  for (const [index, product] of productRows.entries()) {
    const imageUrl = imageUrlByProductId[product.id] || product.imageUrls?.[0] || null;

    await client.query(`
      INSERT INTO products (
        category_id,
        subcategory_id,
        sku,
        name,
        slug,
        brand,
        description,
        short_description,
        unit,
        unit_label,
        package_spec,
        package_size,
        package_size_label,
        origin,
        image_url,
        industry_group,
        product_type,
        catalog_kind,
        use_cases,
        tags,
        selling_points,
        source_key,
        source_confidence,
        source_status_raw,
        data_issues,
        base_price,
        wholesale_price,
        min_order_qty,
        stock_status,
        status,
        sort_order,
        is_active,
        is_orderable,
        is_public
      )
      SELECT
        category.id,
        subcategory.id,
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $7,
        $8,
        $8,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14::jsonb,
        $15::jsonb,
        $16::jsonb,
        $17,
        $18,
        $19,
        $20::jsonb,
        $21,
        $22,
        $23,
        'available',
        $24,
        $25,
        true,
        false,
        true
      FROM categories category
      LEFT JOIN categories subcategory ON subcategory.slug = $26
      WHERE category.slug = $27
      ON CONFLICT (slug) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        subcategory_id = EXCLUDED.subcategory_id,
        sku = COALESCE(products.sku, EXCLUDED.sku),
        name = EXCLUDED.name,
        brand = COALESCE(EXCLUDED.brand, products.brand),
        description = COALESCE(EXCLUDED.description, products.description),
        short_description = COALESCE(EXCLUDED.short_description, products.short_description),
        unit = COALESCE(products.unit, EXCLUDED.unit),
        unit_label = COALESCE(products.unit_label, EXCLUDED.unit_label),
        package_spec = COALESCE(products.package_spec, EXCLUDED.package_spec),
        package_size = COALESCE(products.package_size, EXCLUDED.package_size),
        package_size_label = COALESCE(products.package_size_label, EXCLUDED.package_size_label),
        origin = COALESCE(EXCLUDED.origin, products.origin),
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        industry_group = EXCLUDED.industry_group,
        product_type = EXCLUDED.product_type,
        catalog_kind = EXCLUDED.catalog_kind,
        use_cases = EXCLUDED.use_cases,
        tags = EXCLUDED.tags,
        selling_points = EXCLUDED.selling_points,
        source_key = EXCLUDED.source_key,
        source_confidence = EXCLUDED.source_confidence,
        source_status_raw = EXCLUDED.source_status_raw,
        data_issues = EXCLUDED.data_issues,
        base_price = CASE WHEN products.base_price > 0 THEN products.base_price ELSE EXCLUDED.base_price END,
        wholesale_price = COALESCE(products.wholesale_price, EXCLUDED.wholesale_price),
        min_order_qty = COALESCE(products.min_order_qty, EXCLUDED.min_order_qty),
        status = CASE WHEN products.status = 'active' THEN products.status ELSE EXCLUDED.status END,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        is_orderable = products.is_orderable,
        is_public = true,
        updated_at = now()
    `, [
      product.sku || null,
      product.name,
      product.slug,
      product.brand,
      product.description,
      product.shortDescription,
      product.unit,
      product.packageSize,
      product.origin,
      imageUrl,
      product.industryGroup,
      product.productType,
      product.catalogKind,
      JSON.stringify(product.useCases || []),
      JSON.stringify(product.tags || []),
      JSON.stringify(product.sellingPoints || []),
      SOURCE_KEY,
      product.sourceConfidence,
      product.sourceStatusRaw,
      JSON.stringify(product.dataIssues || []),
      product.priceRetail || 0,
      product.priceWholesale,
      product.minOrderQty || 1,
      product.status,
      index + 1,
      product.subcategoryId,
      product.categoryId,
    ]);
  }

  await client.query("COMMIT");

  const bundleCount = productRows.filter((product) => product.productType === "bundle").length;
  const physicalCount = productRows.length - bundleCount;
  console.log(`Catalog import completed: ${physicalCount} physical products, ${bundleCount} bundles.`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Catalog import failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
