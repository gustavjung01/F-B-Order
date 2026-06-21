import { Router } from "express";
import { getDb } from "../../db/pool";

export const catalogRouter = Router();

const UPDATING_LABEL = "Đang cập nhật";

type ProductRow = {
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
  base_price: string | null;
  wholesale_price: string | null;
  min_order_qty: string | number;
  image_url: string | null;
  short_description: string | null;
  use_cases: unknown;
  selling_points: unknown;
  is_orderable: boolean;
  bundle_item_count: string;
};

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLimit(value: unknown, fallback = 80): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 100);
}

function formatVnd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return UPDATING_LABEL;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function publicCategoryName(slug: string, name: string): string {
  return slug === "combo-cong-thuc" ? "Combo gợi ý" : name;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPublicProduct(row: ProductRow) {
  const bundleItemCount = Number(row.bundle_item_count || 0);
  const unitPrice = toPositiveNumber(row.wholesale_price, toPositiveNumber(row.base_price, 0));
  const minOrderQty = Math.max(1, Math.floor(toPositiveNumber(row.min_order_qty, 1)));
  const hasSellableData = Boolean(row.sku && row.unit_label && unitPrice > 0);
  const hasValidBundle = row.product_type !== "bundle" || bundleItemCount > 0;
  const orderable = Boolean(row.is_orderable && hasSellableData && hasValidBundle);

  return {
    itemKind: "product" as const,
    id: row.id,
    slug: row.slug,
    sku: row.sku || "",
    name: row.name,
    brand: row.brand || UPDATING_LABEL,
    categoryId: row.category_id,
    categoryName: publicCategoryName(row.category_id, row.category_name),
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    productType: row.product_type,
    catalogKind: row.catalog_kind,
    packageSizeLabel: row.package_size_label || UPDATING_LABEL,
    unitLabel: row.unit_label || UPDATING_LABEL,
    unitPrice,
    minOrderQty,
    priceLabel: formatVnd(unitPrice),
    imageUrl: row.image_url,
    shortDescription: row.short_description,
    useCases: Array.isArray(row.use_cases) ? row.use_cases : [],
    sellingPoints: Array.isArray(row.selling_points) ? row.selling_points : [],
    bundleItemCount,
    isOrderable: orderable,
    orderLabel: orderable ? "Thêm vào giỏ" : "Liên hệ cập nhật giá",
  };
}

const productSelect = `
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
    product.base_price,
    product.wholesale_price,
    product.min_order_qty,
    product.image_url,
    product.short_description,
    product.use_cases,
    product.selling_points,
    product.is_orderable,
    (
      SELECT COUNT(*)
      FROM product_bundle_items bundle_item
      WHERE bundle_item.bundle_product_id = product.id
    ) AS bundle_item_count
  FROM products product
  JOIN categories category ON category.id = product.category_id
  LEFT JOIN categories subcategory ON subcategory.id = product.subcategory_id
`;

catalogRouter.get("/categories", async (_req, res) => {
  try {
    const result = await getDb().query<{
      id: string;
      name: string;
      parent_id: string | null;
      sort_order: number;
      product_count: string;
    }>(`
      WITH category_counts AS (
        SELECT
          category.slug AS id,
          category.name,
          parent.slug AS parent_id,
          category.sort_order,
          (
            SELECT COUNT(*)
            FROM products product
            WHERE product.category_id = category.id
              AND product.is_public = true
              AND product.is_active = true
              AND product.status IN ('active', 'needs_review')
          ) AS product_count
        FROM categories category
        LEFT JOIN categories parent ON parent.id = category.parent_id
        WHERE category.is_active = true
          AND category.parent_id IS NULL
      )
      SELECT id, name, parent_id, sort_order, product_count
      FROM category_counts
      WHERE product_count > 0
      ORDER BY sort_order ASC, name ASC
    `);

    res.json({
      categories: result.rows.map((row) => ({
        id: row.id,
        name: publicCategoryName(row.id, row.name),
        parentId: row.parent_id,
        sortOrder: row.sort_order,
        productCount: Number(row.product_count),
      })),
    });
  } catch (error) {
    console.error("catalog categories failed", error);
    res.status(500).json({ error: "CATALOG_CATEGORIES_FAILED" });
  }
});

catalogRouter.get("/products", async (req, res) => {
  const categoryId = readText(req.query.categoryId);
  const subcategoryId = readText(req.query.subcategoryId);
  const search = readText(req.query.q);
  const limit = readLimit(req.query.limit);

  const where: string[] = [
    "product.is_public = true",
    "product.is_active = true",
    "product.status IN ('active', 'needs_review')",
  ];
  const values: unknown[] = [];

  if (categoryId && categoryId !== "all") {
    values.push(categoryId);
    where.push(`category.slug = $${values.length}`);
  }
  if (subcategoryId && subcategoryId !== "all") {
    values.push(subcategoryId);
    where.push(`subcategory.slug = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    where.push(`(
      product.name ILIKE $${values.length}
      OR COALESCE(product.brand, '') ILIKE $${values.length}
      OR COALESCE(product.short_description, '') ILIKE $${values.length}
    )`);
  }

  const countValues = [...values];
  values.push(limit);

  try {
    const result = await getDb().query<ProductRow>(`
      ${productSelect}
      WHERE ${where.join(" AND ")}
      ORDER BY product.sort_order ASC, product.name ASC
      LIMIT $${values.length}
    `, values);

    const countResult = await getDb().query<{ total: string }>(`
      SELECT COUNT(*) AS total
      FROM products product
      JOIN categories category ON category.id = product.category_id
      LEFT JOIN categories subcategory ON subcategory.id = product.subcategory_id
      WHERE ${where.join(" AND ")}
    `, countValues);

    res.json({
      products: result.rows.map(toPublicProduct),
      total: Number(countResult.rows[0]?.total ?? 0),
    });
  } catch (error) {
    console.error("catalog products failed", error);
    res.status(500).json({ error: "CATALOG_PRODUCTS_FAILED" });
  }
});

catalogRouter.get("/products/:slug", async (req, res) => {
  try {
    const result = await getDb().query<ProductRow>(`
      ${productSelect}
      WHERE product.slug = $1
        AND product.is_public = true
        AND product.is_active = true
        AND product.status IN ('active', 'needs_review')
      LIMIT 1
    `, [req.params.slug]);

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
      return;
    }

    res.json({ product: toPublicProduct(row) });
  } catch (error) {
    console.error("catalog product detail failed", error);
    res.status(500).json({ error: "CATALOG_PRODUCT_FAILED" });
  }
});
