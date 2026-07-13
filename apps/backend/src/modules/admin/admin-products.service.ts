import type { Pool, PoolClient } from "pg";
import { getDb } from "../../db/pool";
import type { StaffIdentity } from "../auth/auth.identity";
import { evaluateCatalogOrderability } from "../catalog/orderability-policy";
import { OrderEngineError } from "../orders/order-errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCT_STATUSES = ["needs_review", "active", "draft", "inactive"] as const;
const STOCK_STATUSES = ["available", "out_of_stock", "preorder", "discontinued"] as const;

type ProductStatus = (typeof PRODUCT_STATUSES)[number];
type StockStatus = (typeof STOCK_STATUSES)[number];

type AdminProductRow = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category_id: string;
  category_name: string;
  subcategory_id: string | null;
  subcategory_name: string | null;
  product_type: "physical" | "bundle" | "service";
  catalog_kind: "sku_candidate" | "bundle_candidate";
  package_size_label: string | null;
  unit_label: string | null;
  origin: string | null;
  base_price: string | null;
  wholesale_price: string | null;
  min_order_qty: number;
  image_url: string | null;
  stock_status: StockStatus;
  status: ProductStatus;
  data_issues: unknown;
  is_orderable: boolean;
  is_active: boolean;
  is_public: boolean;
  source_key: string;
  updated_at: string;
  bundle_item_count: string;
  invalid_bundle_item_count: string;
};

type ProductUpdateInput = {
  productId: string;
  sku?: unknown;
  unitLabel?: unknown;
  packageSizeLabel?: unknown;
  origin?: unknown;
  imageUrl?: unknown;
  basePrice?: unknown;
  wholesalePrice?: unknown;
  minOrderQty?: unknown;
  stockStatus?: unknown;
  status?: unknown;
  isPublic?: unknown;
  isActive?: unknown;
  isOrderable?: unknown;
};

const ADMIN_PRODUCT_SELECT = `
  SELECT
    product.id::text,
    product.slug,
    product.sku,
    product.name,
    product.brand,
    category.slug AS category_id,
    category.name AS category_name,
    subcategory.slug AS subcategory_id,
    subcategory.name AS subcategory_name,
    product.product_type,
    product.catalog_kind,
    COALESCE(product.package_size_label, product.package_size, product.package_spec) AS package_size_label,
    COALESCE(product.unit_label, product.unit) AS unit_label,
    product.origin,
    product.base_price,
    product.wholesale_price,
    product.min_order_qty,
    product.image_url,
    product.stock_status,
    product.status,
    product.data_issues,
    product.is_orderable,
    product.is_active,
    product.is_public,
    product.source_key,
    product.updated_at,
    COALESCE(bundle_stats.bundle_item_count, 0)::text AS bundle_item_count,
    COALESCE(bundle_stats.invalid_bundle_item_count, 0)::text AS invalid_bundle_item_count
  FROM products product
  JOIN categories category ON category.id = product.category_id
  LEFT JOIN categories subcategory ON subcategory.id = product.subcategory_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS bundle_item_count,
      COUNT(*) FILTER (
        WHERE component.id IS NULL
           OR component.is_public IS DISTINCT FROM true
           OR component.is_active IS DISTINCT FROM true
           OR COALESCE(component.status, '') NOT IN ('active', 'needs_review')
           OR component.is_orderable IS DISTINCT FROM true
           OR NULLIF(BTRIM(component.sku), '') IS NULL
           OR NULLIF(BTRIM(COALESCE(component.unit_label, component.unit)), '') IS NULL
           OR NOT (
             COALESCE(component.wholesale_price, 0) > 0
             OR COALESCE(component.base_price, 0) > 0
             OR EXISTS (
               SELECT 1
               FROM product_prices component_price
               WHERE component_price.product_id = component.id
                 AND component_price.price > 0
             )
           )
      ) AS invalid_bundle_item_count
    FROM product_bundle_items bundle_item
    LEFT JOIN products component ON component.id = bundle_item.component_product_id
    WHERE bundle_item.bundle_product_id = product.id
  ) bundle_stats ON true
`;

function assertAdmin(identity: StaffIdentity): void {
  if (!identity.isActive || identity.role !== "admin") {
    throw new OrderEngineError("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
  }
}

function normalizeProductId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("INVALID_PRODUCT_ID", 400, "productId must be a UUID.");
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength = 500): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new OrderEngineError("INVALID_PRODUCT_FIELD", 400, `${field} must be text or null.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new OrderEngineError("INVALID_PRODUCT_FIELD", 400, `${field} cannot exceed ${maxLength} characters.`);
  }
  return normalized;
}

function optionalMoney(value: unknown, field: string, nullFallback: number | null): number | null {
  if (value === null || value === undefined || value === "") return nullFallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999_999_999_999) {
    throw new OrderEngineError("INVALID_PRODUCT_PRICE", 400, `${field} must be a non-negative number.`);
  }
  return Math.round(amount * 100) / 100;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new OrderEngineError("INVALID_PRODUCT_QUANTITY", 400, `${field} must be an integer from 1 to 1000000.`);
  }
  return parsed;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new OrderEngineError("INVALID_PRODUCT_FIELD", 400, `${field} must be boolean.`);
  }
  return value;
}

function productStatus(value: unknown): ProductStatus {
  if (typeof value !== "string" || !PRODUCT_STATUSES.includes(value as ProductStatus)) {
    throw new OrderEngineError("INVALID_PRODUCT_STATUS", 400, "Unknown product status.");
  }
  return value as ProductStatus;
}

function stockStatus(value: unknown): StockStatus {
  if (typeof value !== "string" || !STOCK_STATUSES.includes(value as StockStatus)) {
    throw new OrderEngineError("INVALID_STOCK_STATUS", 400, "Unknown stock status.");
  }
  return value as StockStatus;
}

function toAdminProduct(row: AdminProductRow) {
  const orderability = evaluateCatalogOrderability({
    productType: row.product_type,
    sku: row.sku,
    unitLabel: row.unit_label,
    isPublic: row.is_public,
    isActive: row.is_active,
    orderingEnabled: row.is_orderable,
    bundleItemCount: Number(row.bundle_item_count || 0),
    invalidBundleItemCount: Number(row.invalid_bundle_item_count || 0),
    sourceDataIssues: row.data_issues,
    basePrice: row.base_price,
    wholesalePrice: row.wholesale_price,
    priceGroupPrice: null,
  });
  const issues = new Set(orderability.dataIssues);
  if (row.package_size_label) issues.delete("missing_package_size");
  if (row.origin) issues.delete("missing_origin");
  if (row.image_url) issues.delete("missing_image");
  if (Number(row.base_price || 0) > 0) issues.delete("missing_price_retail");
  if (Number(row.wholesale_price || 0) > 0) issues.delete("missing_price_wholesale");
  if (row.sku) issues.delete("needs_official_sku");

  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    categoryId: row.category_id,
    categoryName: row.category_name,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    productType: row.product_type,
    catalogKind: row.catalog_kind,
    packageSizeLabel: row.package_size_label,
    unitLabel: row.unit_label,
    origin: row.origin,
    basePrice: Number(row.base_price || 0),
    wholesalePrice: row.wholesale_price === null ? null : Number(row.wholesale_price),
    minOrderQty: Number(row.min_order_qty || 1),
    imageUrl: row.image_url,
    stockStatus: row.stock_status,
    status: row.status,
    dataIssues: [...issues].sort(),
    catalogEligible: orderability.catalogEligible,
    isOrderable: row.is_orderable,
    isActive: row.is_active,
    isPublic: row.is_public,
    sourceKey: row.source_key,
    bundleItemCount: Number(row.bundle_item_count || 0),
    updatedAt: row.updated_at,
  };
}

async function findAdminProduct(db: Pool | PoolClient, productId: string) {
  const result = await db.query<AdminProductRow>(
    `${ADMIN_PRODUCT_SELECT}
     WHERE product.id = $1
     LIMIT 1`,
    [productId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new OrderEngineError("PRODUCT_NOT_FOUND", 404, "Product was not found.");
  }
  return toAdminProduct(row);
}

export async function listAdminProducts(
  identity: StaffIdentity,
  input: { search?: unknown; issue?: unknown; limit?: number } = {},
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const issue = typeof input.issue === "string" ? input.issue.trim() : "";
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 100), 1), 200);
  const values: unknown[] = [];
  const clauses: string[] = [];

  if (search) {
    values.push(`%${search}%`);
    clauses.push(`(
      product.name ILIKE $${values.length}
      OR COALESCE(product.brand, '') ILIKE $${values.length}
      OR COALESCE(product.sku, '') ILIKE $${values.length}
      OR product.slug ILIKE $${values.length}
    )`);
  }
  values.push(limit);

  const result = await db.query<AdminProductRow>(
    `${ADMIN_PRODUCT_SELECT}
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY product.updated_at DESC, product.name ASC
     LIMIT $${values.length}`,
    values,
  );
  const products = result.rows.map(toAdminProduct);
  const filtered = issue && issue !== "all"
    ? products.filter((product) => product.dataIssues.includes(issue))
    : products;

  return { products: filtered, total: filtered.length };
}

export async function getAdminProductDetail(
  identity: StaffIdentity,
  productId: string,
  db: Pool | PoolClient = getDb(),
) {
  assertAdmin(identity);
  return { product: await findAdminProduct(db, normalizeProductId(productId)) };
}

export async function updateAdminProduct(
  identity: StaffIdentity,
  input: ProductUpdateInput,
  db: Pool = getDb(),
) {
  assertAdmin(identity);
  const productId = normalizeProductId(input.productId);
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (Object.hasOwn(input, "sku")) add("sku", optionalText(input.sku, "sku", 120));
  if (Object.hasOwn(input, "unitLabel")) add("unit_label", optionalText(input.unitLabel, "unitLabel", 120));
  if (Object.hasOwn(input, "packageSizeLabel")) add("package_size_label", optionalText(input.packageSizeLabel, "packageSizeLabel", 200));
  if (Object.hasOwn(input, "origin")) add("origin", optionalText(input.origin, "origin", 200));
  if (Object.hasOwn(input, "imageUrl")) add("image_url", optionalText(input.imageUrl, "imageUrl", 2000));
  if (Object.hasOwn(input, "basePrice")) add("base_price", optionalMoney(input.basePrice, "basePrice", 0));
  if (Object.hasOwn(input, "wholesalePrice")) add("wholesale_price", optionalMoney(input.wholesalePrice, "wholesalePrice", null));
  if (Object.hasOwn(input, "minOrderQty")) add("min_order_qty", positiveInteger(input.minOrderQty, "minOrderQty"));
  if (Object.hasOwn(input, "stockStatus")) add("stock_status", stockStatus(input.stockStatus));
  if (Object.hasOwn(input, "status")) add("status", productStatus(input.status));
  if (Object.hasOwn(input, "isPublic")) add("is_public", requiredBoolean(input.isPublic, "isPublic"));
  if (Object.hasOwn(input, "isActive")) add("is_active", requiredBoolean(input.isActive, "isActive"));
  if (Object.hasOwn(input, "isOrderable")) add("is_orderable", requiredBoolean(input.isOrderable, "isOrderable"));

  if (assignments.length === 0) {
    throw new OrderEngineError("EMPTY_PRODUCT_UPDATE", 400, "At least one product field is required.");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const lockResult = await client.query<{ id: string }>(
      `SELECT id::text FROM products WHERE id = $1 FOR UPDATE`,
      [productId],
    );
    if (!lockResult.rows[0]) {
      throw new OrderEngineError("PRODUCT_NOT_FOUND", 404, "Product was not found.");
    }

    values.push(productId);
    await client.query(
      `UPDATE products
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $${values.length}`,
      values,
    );

    const product = await findAdminProduct(client, productId);
    const readinessIssues = [...product.dataIssues];
    if (product.status !== "active" && product.status !== "needs_review") {
      readinessIssues.push("invalid_status");
    }
    if (product.stockStatus === "discontinued") {
      readinessIssues.push("discontinued");
    }
    if (product.isOrderable && (!product.catalogEligible || readinessIssues.includes("invalid_status") || readinessIssues.includes("discontinued"))) {
      throw new OrderEngineError(
        "PRODUCT_NOT_READY",
        400,
        "Product is missing required operational data before it can be sold.",
        { dataIssues: [...new Set(readinessIssues)].sort() },
      );
    }

    await client.query("COMMIT");
    return { product };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
