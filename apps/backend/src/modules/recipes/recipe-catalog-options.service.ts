import type { Pool } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { StaffIdentity } from "../auth/auth.identity";
import { OrderEngineError } from "../orders/order-errors";

const DEFAULT_CATALOG_ASSET_BASE_URL = "https://cdn.bepsi.click";
const RECIPE_INGREDIENT_CATALOG_GROUPS = [
  "tra",
  "siro",
  "sot",
  "sinh-to",
  "bot-sua-kem-beo",
  "milk-foam-kem-cheese",
  "tran-chau",
  "3q",
  "thach-rau-cau",
  "flan-pudding",
  "bot-tao-vi",
] as const;

function assetUrl(objectKey: string | null): string | null {
  if (!objectKey) return null;
  const base = (
    process.env.R2_PUBLIC_BASE_URL
    || process.env.CATALOG_ASSET_BASE_URL
    || DEFAULT_CATALOG_ASSET_BASE_URL
  ).trim();
  return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
}

export async function searchRecipeCatalogOptionsWithImages(
  identity: StaffIdentity,
  input: { search?: unknown; limit?: unknown },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const search = typeof input.search === "string" ? input.search.trim() : "";
  if (search.length < 2) {
    throw new OrderEngineError("RECIPE_CATALOG_QUERY_TOO_SHORT", 400, "Search query must contain at least 2 characters.");
  }

  const parsedLimit = Number.parseInt(String(input.limit ?? "20"), 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 20;
  const result = await db.query<{
    variantId: string;
    productId: string;
    productName: string;
    brand: string | null;
    variantName: string;
    sku: string;
    options: Record<string, unknown> | null;
    priceMode: string;
    priceLabel: string | null;
    isOrderable: boolean;
    imageObjectKey: string | null;
  }>(
    `SELECT
       variant.id::text AS "variantId",
       product.id::text AS "productId",
       product.name AS "productName",
       product.brand,
       variant.name AS "variantName",
       variant.sku,
       variant.options,
       variant.price_mode AS "priceMode",
       variant.price_label AS "priceLabel",
       variant.is_orderable AS "isOrderable",
       COALESCE(variant.image_object_key, product.cover_image_object_key) AS "imageObjectKey"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id = variant.product_id
     WHERE product.catalog_version = 'hung-phat-v2'
       AND product.status = 'active'
       AND product.catalog_group_key = ANY($2::text[])
       AND variant.catalog_version = 'hung-phat-v2'
       AND variant.is_active = true
       AND variant.is_public = true
       AND variant.status IN ('active', 'market_price')
       AND (
         product.name ILIKE $1
         OR variant.name ILIKE $1
         OR variant.sku ILIKE $1
         OR COALESCE(product.brand, '') ILIKE $1
       )
     ORDER BY product.sort_order ASC, variant.sort_order ASC, variant.sku ASC
     LIMIT $3`,
    [`%${search}%`, RECIPE_INGREDIENT_CATALOG_GROUPS, limit],
  );

  return {
    items: result.rows.map(({ imageObjectKey, ...item }) => ({
      ...item,
      options: item.options || {},
      imageUrl: assetUrl(imageObjectKey),
    })),
  };
}
