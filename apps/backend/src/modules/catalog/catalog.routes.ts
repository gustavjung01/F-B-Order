import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import {
  anonymousIdentity,
  type RequestIdentity,
} from "../auth/auth.identity";
import { evaluatePricingPolicy, selectApprovedCustomerPrice } from "./access-policy";

const UPDATING_LABEL = "Đang cập nhật";

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

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
  price_group_price: string | null;
  min_order_qty: string | number;
  image_url: string | null;
  short_description: string | null;
  use_cases: unknown;
  selling_points: unknown;
  is_orderable: boolean;
  is_active: boolean;
  is_public: boolean;
  bundle_item_count: string;
};

type CatalogFilterInput = {
  categoryId: string | null;
  subcategoryId: string | null;
  search: string | null;
};

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readLimit(value: unknown, fallback = 80): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 100);
}

function publicCategoryName(slug: string, name: string): string {
  return slug === "combo-cong-thuc" ? "Combo gợi ý" : name;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildCatalogFilters(input: CatalogFilterInput, startIndex: number) {
  const clauses = [
    "product.is_public = true",
    "product.is_active = true",
    "product.status IN ('active', 'needs_review')",
  ];
  const values: unknown[] = [];
  let parameterIndex = startIndex;

  if (input.categoryId && input.categoryId !== "all") {
    clauses.push(`category.slug = $${parameterIndex}`);
    values.push(input.categoryId);
    parameterIndex += 1;
  }

  if (input.subcategoryId && input.subcategoryId !== "all") {
    clauses.push(`subcategory.slug = $${parameterIndex}`);
    values.push(input.subcategoryId);
    parameterIndex += 1;
  }

  if (input.search) {
    clauses.push(`(
      product.name ILIKE $${parameterIndex}
      OR COALESCE(product.brand, '') ILIKE $${parameterIndex}
      OR COALESCE(product.short_description, '') ILIKE $${parameterIndex}
    )`);
    values.push(`%${input.search}%`);
  }

  return { clauses, values };
}

function productSelect(priceGroupParameter: number) {
  return `
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
      customer_price.price AS price_group_price,
      product.min_order_qty,
      product.image_url,
      product.short_description,
      product.use_cases,
      product.selling_points,
      product.is_orderable,
      product.is_active,
      product.is_public,
      (
        SELECT COUNT(*)
        FROM product_bundle_items bundle_item
        WHERE bundle_item.bundle_product_id = product.id
      ) AS bundle_item_count
    FROM products product
    JOIN categories category ON category.id = product.category_id
    LEFT JOIN categories subcategory ON subcategory.id = product.subcategory_id
    LEFT JOIN LATERAL (
      SELECT product_price.price
      FROM product_prices product_price
      WHERE product_price.product_id = product.id
        AND product_price.price_group_id = $${priceGroupParameter}::uuid
        AND product_price.min_quantity <= GREATEST(product.min_order_qty, 1)
      ORDER BY product_price.min_quantity DESC
      LIMIT 1
    ) customer_price ON true
  `;
}

function toCatalogProduct(row: ProductRow, identity: RequestIdentity) {
  const bundleItemCount = Number(row.bundle_item_count || 0);
  const minOrderQty = Math.max(1, Math.floor(toPositiveNumber(row.min_order_qty, 1)));
  const structurallyOrderable = Boolean(
    row.is_orderable &&
      row.is_active &&
      row.is_public &&
      row.sku &&
      row.unit_label &&
      (row.product_type !== "bundle" || bundleItemCount > 0),
  );
  const pricingInput = {
    basePrice: row.base_price,
    wholesalePrice: row.wholesale_price,
    priceGroupPrice: row.price_group_price,
  };
  const selectedPrice = selectApprovedCustomerPrice(pricingInput);
  const pricing = evaluatePricingPolicy(
    identity,
    pricingInput,
    structurallyOrderable && selectedPrice !== null,
  );

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
    minOrderQty,
    imageUrl: row.image_url,
    shortDescription: row.short_description,
    useCases: Array.isArray(row.use_cases) ? row.use_cases : [],
    sellingPoints: Array.isArray(row.selling_points) ? row.selling_points : [],
    bundleItemCount,
    pricing,
    isOrderable: pricing.canOrder,
    orderLabel: pricing.canOrder ? "Thêm vào giỏ" : "Chưa đủ điều kiện đặt hàng",
  };
}

async function resolveIdentity(
  req: Request,
  res: Response,
  resolver: IdentityResolver,
): Promise<RequestIdentity | null> {
  try {
    return await resolver(req);
  } catch (error) {
    console.error("catalog identity resolution failed", error);
    res.status(503).json({ error: "IDENTITY_RESOLUTION_FAILED" });
    return null;
  }
}

export function createCatalogRouter(
  identityResolver: IdentityResolver = async () => anonymousIdentity,
) {
  const catalogRouter = Router();

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
        WHERE id IN (
          'tra-sua-pha-che',
          'mi-cay-han-quoc',
          'thuc-pham-dong-lanh',
          'combo-cong-thuc'
        )
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
    const identity = await resolveIdentity(req, res, identityResolver);
    if (!identity) return;

    const filterInput: CatalogFilterInput = {
      categoryId: readText(req.query.categoryId),
      subcategoryId: readText(req.query.subcategoryId),
      search: readText(req.query.q),
    };
    const limit = readLimit(req.query.limit);
    const productFilters = buildCatalogFilters(filterInput, 2);
    const countFilters = buildCatalogFilters(filterInput, 1);
    const priceGroupId = identity.kind === "customer" ? identity.priceGroupId : null;
    const productValues = [priceGroupId, ...productFilters.values, limit];

    try {
      const result = await getDb().query<ProductRow>(
        `${productSelect(1)}
         WHERE ${productFilters.clauses.join(" AND ")}
         ORDER BY product.sort_order ASC, product.name ASC
         LIMIT $${productValues.length}`,
        productValues,
      );

      const countResult = await getDb().query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM products product
         JOIN categories category ON category.id = product.category_id
         LEFT JOIN categories subcategory ON subcategory.id = product.subcategory_id
         WHERE ${countFilters.clauses.join(" AND ")}`,
        countFilters.values,
      );

      res.json({
        products: result.rows.map((row) => toCatalogProduct(row, identity)),
        total: Number(countResult.rows[0]?.total ?? 0),
      });
    } catch (error) {
      console.error("catalog products failed", error);
      res.status(500).json({ error: "CATALOG_PRODUCTS_FAILED" });
    }
  });

  catalogRouter.get("/products/:slug", async (req, res) => {
    const identity = await resolveIdentity(req, res, identityResolver);
    if (!identity) return;
    const priceGroupId = identity.kind === "customer" ? identity.priceGroupId : null;

    try {
      const result = await getDb().query<ProductRow>(
        `${productSelect(1)}
         WHERE product.slug = $2
           AND product.is_public = true
           AND product.is_active = true
           AND product.status IN ('active', 'needs_review')
         LIMIT 1`,
        [priceGroupId, req.params.slug],
      );

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
        return;
      }

      res.json({ product: toCatalogProduct(row, identity) });
    } catch (error) {
      console.error("catalog product detail failed", error);
      res.status(500).json({ error: "CATALOG_PRODUCT_FAILED" });
    }
  });

  return catalogRouter;
}

export const catalogRouter = createCatalogRouter();
