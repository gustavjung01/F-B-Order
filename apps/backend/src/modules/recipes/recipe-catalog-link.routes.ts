import { Router, type Request, type Response } from "express";
import type { PoolClient } from "pg";
import { getDb } from "../../db/pool";
import { requireAdmin } from "../admin/admin-access";
import type { RequestIdentity, StaffIdentity } from "../auth/auth.identity";
import {
  catalogChoiceGroupsForSku,
  parseCatalogChoiceGroups,
  validateCatalogSelections,
} from "../catalog-v2/catalog-v2-choices";

export type RecipeCatalogIdentityResolver = (req: Request) => Promise<RequestIdentity>;
type Unit = "g" | "kg" | "ml" | "l" | "piece" | "portion" | "pack";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNITS = new Set<Unit>(["g", "kg", "ml", "l", "piece", "portion", "pack"]);

class LinkError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); }
}
function fail(code: string, status: number, message: string): never { throw new LinkError(code, status, message); }
function id(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID.test(normalized)) fail("INVALID_RECIPE_CATALOG_LINK", 400, `${field} must be a UUID.`);
  return normalized;
}
function decimal(value: unknown, field: string, min = 0, max = 1_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail("INVALID_RECIPE_CATALOG_LINK", 400, `${field} is out of range.`);
  return parsed;
}
function unit(value: unknown, field: string): Unit {
  if (typeof value !== "string" || !UNITS.has(value as Unit)) fail("INVALID_RECIPE_CATALOG_LINK", 400, `${field} is invalid.`);
  return value as Unit;
}
function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_RECIPE_CATALOG_LINK", 400, "Body must be an object.");
  return value as Record<string, unknown>;
}
async function assertAdmin(client: PoolClient, identity: StaffIdentity) {
  const result = await client.query<{ role: string; is_active: boolean }>(
    `SELECT role,is_active FROM staff_users WHERE id=$1::uuid FOR SHARE`, [identity.staffId],
  );
  if (!result.rows[0] || result.rows[0].role !== "admin" || !result.rows[0].is_active) fail("ADMIN_ACCESS_REQUIRED", 403, "Admin role is required.");
}
async function transaction<T>(identity: StaffIdentity, run: (client: PoolClient) => Promise<T>) {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await assertAdmin(client, identity);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
async function lockEditableIngredient(client: PoolClient, recipeId: string, ingredientId: string) {
  const result = await client.query<{ status: string; ingredient_name: string }>(
    `SELECT recipe.status,ingredient.name AS ingredient_name
     FROM recipes recipe JOIN recipe_ingredients ingredient ON ingredient.recipe_id=recipe.id
     WHERE recipe.id=$1::uuid AND ingredient.id=$2::uuid FOR UPDATE OF recipe,ingredient`,
    [recipeId, ingredientId],
  );
  const row = result.rows[0];
  if (!row) fail("RECIPE_INGREDIENT_NOT_FOUND", 404, "Recipe ingredient was not found.");
  if (!['draft','in_review'].includes(row.status)) fail("RECIPE_NOT_EDITABLE", 409, "Only draft or in-review recipes can change Catalog links.");
  return row;
}
async function loadCatalog(client: PoolClient, productId: string, variantId: string) {
  const result = await client.query<{
    product_name: string; product_status: string; choice_groups: unknown;
    variant_id: string | null; variant_name: string | null; sku: string | null;
    options: Record<string, unknown> | null; variant_status: string | null;
    is_active: boolean | null; is_public: boolean | null; is_orderable: boolean | null;
  }>(
    `SELECT p.name product_name,p.status product_status,p.choice_groups,
      v.id::text variant_id,v.name variant_name,v.sku,v.options,v.status variant_status,
      v.is_active,v.is_public,v.is_orderable
     FROM catalog_products p
     LEFT JOIN catalog_variants v ON v.id=$2::uuid AND v.product_id=p.id AND v.catalog_version='hung-phat-v2'
     WHERE p.id=$1::uuid AND p.catalog_version='hung-phat-v2'`,
    [productId, variantId],
  );
  const row = result.rows[0];
  if (!row) fail("CATALOG_PRODUCT_NOT_FOUND", 400, "Catalog product was not found.");
  if (!row.variant_id || row.variant_id !== variantId) fail("CATALOG_VARIANT_PARENT_MISMATCH", 400, "Variant does not belong to product.");
  return row;
}
function specification(options: Record<string, unknown> | null) {
  const value = options || {};
  return [
    typeof value.size === "string" ? value.size : null,
    typeof value.package === "string" ? value.package : null,
    typeof value.sell_unit === "string" ? `ĐVT: ${value.sell_unit}` : null,
  ].filter(Boolean).join(" · ") || null;
}

export async function linkRecipeIngredient(identity: StaffIdentity, recipeIdValue: unknown, ingredientIdValue: unknown, body: unknown) {
  const recipeId = id(recipeIdValue, "recipeId");
  const ingredientId = id(ingredientIdValue, "ingredientId");
  const input = object(body);
  const productId = id(input.productId, "productId");
  const variantId = id(input.variantId, "variantId");
  const usageQuantity = decimal(input.usageQuantity, "usageQuantity", 0.0001);
  const usageUnit = unit(input.usageUnit, "usageUnit");
  const packageContentQuantity = decimal(input.packageContentQuantity, "packageContentQuantity", 0.0001);
  const packageContentUnit = unit(input.packageContentUnit, "packageContentUnit");
  const wastePercent = decimal(input.wastePercent ?? 0, "wastePercent", 0, 100);
  const usableYieldPercent = decimal(input.usableYieldPercent ?? 100, "usableYieldPercent", 0.01, 100);
  const isCartReady = input.isCartReady !== false;

  return transaction(identity, async (client) => {
    await lockEditableIngredient(client, recipeId, ingredientId);
    const catalog = await loadCatalog(client, productId, variantId);
    const groups = catalogChoiceGroupsForSku(parseCatalogChoiceGroups(catalog.choice_groups), catalog.sku || "");
    let validated: { selections: Record<string, string>; selectionKey: string };
    try { validated = validateCatalogSelections(input.selections, groups); }
    catch (error) {
      const source = error as { code?: string; status?: number; message?: string };
      fail(source.code || "INVALID_SELECTION", source.status || 400, source.message || "Invalid selection.");
    }
    if (isCartReady && (!catalog.is_active || !catalog.is_public || !catalog.is_orderable || !['active','market_price'].includes(catalog.variant_status || ''))) {
      fail("CATALOG_VARIANT_NOT_ORDERABLE", 409, "Cart-ready link requires an active public orderable variant.");
    }
    await client.query(
      `UPDATE recipe_ingredients SET source_type='catalog',catalog_product_id=$3::uuid,catalog_variant_id=$4::uuid,
       default_selections=$5::jsonb,selection_key=$6,usage_quantity=$7,usage_unit=$8,
       package_content_quantity=$9,package_content_unit=$10,waste_percent=$11,usable_yield_percent=$12,
       is_cart_ready=$13,catalog_product_name_snapshot=$14,catalog_variant_name_snapshot=$15,
       sku_snapshot=$16,specification_snapshot=$17,selection_key_snapshot=$6,provenance_source='human',updated_at=now()
       WHERE recipe_id=$1::uuid AND id=$2::uuid`,
      [recipeId, ingredientId, productId, variantId, JSON.stringify(validated.selections), validated.selectionKey,
        usageQuantity, usageUnit, packageContentQuantity, packageContentUnit, wastePercent, usableYieldPercent,
        isCartReady, catalog.product_name, catalog.variant_name, catalog.sku, specification(catalog.options)],
    );
    await client.query(`UPDATE recipes SET status='draft',approved_by_staff_id=NULL,updated_at=now() WHERE id=$1::uuid`, [recipeId]);
    return { ingredientId, productId, variantId, ...validated, isCartReady };
  });
}

export async function unlinkRecipeIngredient(identity: StaffIdentity, recipeIdValue: unknown, ingredientIdValue: unknown) {
  const recipeId = id(recipeIdValue, "recipeId");
  const ingredientId = id(ingredientIdValue, "ingredientId");
  return transaction(identity, async (client) => {
    await lockEditableIngredient(client, recipeId, ingredientId);
    await client.query(
      `UPDATE recipe_ingredients SET source_type='external',catalog_product_id=NULL,catalog_variant_id=NULL,
       default_selections='{}'::jsonb,selection_key='',is_cart_ready=false,
       catalog_product_name_snapshot=NULL,catalog_variant_name_snapshot=NULL,sku_snapshot=NULL,
       specification_snapshot=NULL,selection_key_snapshot=NULL,updated_at=now()
       WHERE recipe_id=$1::uuid AND id=$2::uuid`, [recipeId, ingredientId],
    );
    await client.query(`UPDATE recipes SET status='draft',approved_by_staff_id=NULL,updated_at=now() WHERE id=$1::uuid`, [recipeId]);
    return { ingredientId, unlinked: true };
  });
}

export async function searchRecipeCatalogCandidates(queryValue: unknown, limitValue: unknown) {
  const query = typeof queryValue === "string" ? queryValue.trim() : "";
  const limit = Math.min(50, Math.max(1, Number(limitValue) || 20));
  const result = await getDb().query(
    `SELECT p.id::text AS "productId",p.name AS "productName",p.brand,p.industry,p.industry_key AS "industryKey",
      p.catalog_group_key AS "catalogGroupKey",p.choice_groups AS "choiceGroups",p.status AS "productStatus",
      v.id::text AS "variantId",v.name AS "variantName",v.sku,v.options,v.status AS "variantStatus",
      v.is_active AS "isActive",v.is_public AS "isPublic",v.is_orderable AS "isOrderable"
     FROM catalog_products p JOIN catalog_variants v ON v.product_id=p.id
     WHERE p.catalog_version='hung-phat-v2' AND v.catalog_version='hung-phat-v2'
       AND ($1='' OR p.name ILIKE $2 OR v.name ILIKE $2 OR v.sku ILIKE $2)
     ORDER BY p.sort_order,v.sort_order,p.name,v.name LIMIT $3`,
    [query, `%${query}%`, limit],
  );
  return { candidates: result.rows, total: result.rows.length };
}
function sendError(res: Response, error: unknown) {
  if (error instanceof LinkError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
  console.error("recipe catalog link failed", error);
  res.status(500).json({ error: "RECIPE_CATALOG_LINK_FAILED" });
}
export function createRecipeCatalogLinkRouter(resolveIdentity: RecipeCatalogIdentityResolver) {
  const router = Router();
  const admin = async (req: Request) => requireAdmin(await resolveIdentity(req));
  router.get("/search", async (req, res) => {
    try { await admin(req); res.json(await searchRecipeCatalogCandidates(req.query.q, req.query.limit)); }
    catch (error) { sendError(res, error); }
  });
  router.put("/recipes/:recipeId/ingredients/:ingredientId", async (req, res) => {
    try { res.json(await linkRecipeIngredient(await admin(req), req.params.recipeId, req.params.ingredientId, req.body)); }
    catch (error) { sendError(res, error); }
  });
  router.delete("/recipes/:recipeId/ingredients/:ingredientId", async (req, res) => {
    try { res.json(await unlinkRecipeIngredient(await admin(req), req.params.recipeId, req.params.ingredientId)); }
    catch (error) { sendError(res, error); }
  });
  return router;
}
