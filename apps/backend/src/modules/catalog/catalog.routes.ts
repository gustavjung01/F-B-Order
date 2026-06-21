import type { Request, Response } from "express";
import { Router } from "express";
import { getDb } from "../../db/pool";
import { anonymousIdentity, type RequestIdentity } from "../auth/auth.identity";
import {
  toCatalogProduct,
  type CatalogProductRow,
} from "./catalog-contract";

const ROOT_CATEGORY_IDS = [
  "tra-sua-pha-che",
  "mi-cay-han-quoc",
  "thuc-pham-dong-lanh",
  "combo-cong-thuc",
] as const;

type IdentityResolver = (req: Request) => Promise<RequestIdentity>;

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
      product.data_issues,
      product.is_orderable AS ordering_enabled,
      product.is_active,
      product.is_public,
      COALESCE(bundle_stats.bundle_item_count, 0)::text AS bundle_item_count,
      COALESCE(bundle_stats.invalid_bundle_item_count, 0)::text AS invalid_bundle_item_count
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
        is_active: boolean;
        product_count: string;
      }>(`
        SELECT
          category.slug AS id,
          category.name,
          NULL::text AS parent_id,
          category.sort_order,
          category.is_active,
          COUNT(product.id) FILTER (
            WHERE product.is_public = true
              AND product.is_active = true
              AND product.status IN ('active', 'needs_review')
          )::text AS product_count
        FROM categories category
        LEFT JOIN products product ON product.category_id = category.id
        WHERE category.parent_id IS NULL
          AND category.slug = ANY($1::text[])
        GROUP BY category.id, category.slug, category.name, category.sort_order, category.is_active
        ORDER BY category.sort_order ASC, category.name ASC
      `, [ROOT_CATEGORY_IDS]);

      const categories = result.rows.map((row) => ({
        id: row.id,
        name: publicCategoryName(row.id, row.name),
        parentId: row.parent_id,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        productCount: Number(row.product_count),
        hasProducts: Number(row.product_count) > 0,
      }));

      res.json({ categories, total: categories.length });
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
      const result = await getDb().query<CatalogProductRow>(
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
      const result = await getDb().query<CatalogProductRow>(
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
