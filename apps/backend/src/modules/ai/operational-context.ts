import { getDb } from "../../db/pool.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { requirePermission } from "../auth/auth.permissions.js";
import { OrderEngineError } from "../orders/order-errors.js";
import { buildRecipeCostPreview, type RecipeCostIngredientInput } from "./recipe-cost.js";

export type OperationalScope = "catalog" | "cost" | "inventory" | "suppliers";

export type OperationalReadiness = {
  scope: OperationalScope;
  status: "ready" | "empty";
  recordCount: number;
  message: string;
};

export type OperationalContext = {
  schemaVersion: "phase3-v1";
  generatedAt: string;
  scopes: OperationalScope[];
  readiness: OperationalReadiness[];
  catalog?: unknown;
  cost?: unknown;
  inventory?: unknown;
  suppliers?: unknown;
};

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function readiness(
  scope: OperationalScope,
  recordCount: number,
  readyMessage: string,
  emptyMessage: string,
): OperationalReadiness {
  return {
    scope,
    status: recordCount > 0 ? "ready" : "empty",
    recordCount,
    message: recordCount > 0 ? readyMessage : emptyMessage,
  };
}

async function loadCatalogContext() {
  const db = getDb();
  const [summaryResult, itemResult] = await Promise.all([
    db.query<{
      activeProductCount: number;
      activeVariantCount: number;
      orderableVariantCount: number;
      missingPriceCount: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM catalog_products WHERE status = 'active') AS "activeProductCount",
         (SELECT count(*)::int FROM catalog_variants WHERE is_active = true) AS "activeVariantCount",
         (SELECT count(*)::int FROM catalog_variants WHERE is_active = true AND is_orderable = true) AS "orderableVariantCount",
         (SELECT count(*)::int FROM catalog_variants
           WHERE is_active = true AND shop_price IS NULL AND retail_price IS NULL) AS "missingPriceCount"`,
    ),
    db.query(
      `SELECT
         product.id::text AS "productId",
         product.product_key AS "productKey",
         product.name AS "productName",
         product.brand,
         product.industry,
         product.subcategory,
         variant.id::text AS "variantId",
         variant.variant_key AS "variantKey",
         variant.sku,
         variant.name AS "variantName",
         variant.options,
         variant.price_mode AS "priceMode",
         variant.price_label AS "priceLabel",
         variant.retail_price::text AS "retailPrice",
         variant.shop_price::text AS "shopPrice",
         variant.status,
         variant.is_orderable AS "isOrderable",
         variant.updated_at AS "updatedAt"
       FROM catalog_variants variant
       JOIN catalog_products product ON product.id = variant.product_id
       WHERE variant.is_active = true
       ORDER BY variant.updated_at DESC, product.name, variant.name
       LIMIT 100`,
    ),
  ]);

  const summary = summaryResult.rows[0] || {
    activeProductCount: 0,
    activeVariantCount: 0,
    orderableVariantCount: 0,
    missingPriceCount: 0,
  };
  return {
    summary,
    recentVariants: itemResult.rows,
    recordCount: integer(summary.activeVariantCount),
  };
}

async function loadCostContext(recipeId?: string) {
  const db = getDb();
  const coverageResult = await db.query(
    `SELECT
       count(*)::int AS "activeVariantCount",
       count(*) FILTER (WHERE shop_price IS NOT NULL OR retail_price IS NOT NULL)::int AS "pricedVariantCount",
       count(*) FILTER (WHERE shop_price IS NULL AND retail_price IS NULL)::int AS "missingPriceCount",
       count(*) FILTER (WHERE price_mode = 'market')::int AS "marketPriceCount",
       round(avg(shop_price),2)::text AS "averageShopPrice",
       round(avg(retail_price),2)::text AS "averageRetailPrice"
     FROM catalog_variants
     WHERE is_active = true`,
  );

  if (!recipeId) {
    const coverage = coverageResult.rows[0] || {};
    return {
      pricingCoverage: coverage,
      recipeCost: null,
      recordCount: integer(coverage.pricedVariantCount),
    };
  }

  const [recipeResult, ingredientResult] = await Promise.all([
    db.query<{
      id: string;
      title: string;
      yieldQuantity: string | null;
      yieldUnit: string | null;
    }>(
      `SELECT
         id::text,
         title,
         yield_quantity::text AS "yieldQuantity",
         yield_unit AS "yieldUnit"
       FROM recipes
       WHERE id = $1`,
      [recipeId],
    ),
    db.query<{
      productName: string;
      quantity: string | null;
      unit: string | null;
      optional: boolean;
      catalogVariantId: string | null;
      sourceType: string | null;
      sourceRecipeSlug: string | null;
      sku: string | null;
      shopPrice: string | null;
      retailPrice: string | null;
      variantData: unknown;
      productData: unknown;
    }>(
      `SELECT
         ingredient.product_name AS "productName",
         ingredient.quantity::text AS quantity,
         ingredient.unit,
         ingredient.optional,
         ingredient.catalog_variant_id::text AS "catalogVariantId",
         ingredient.source_type AS "sourceType",
         ingredient.source_recipe_slug AS "sourceRecipeSlug",
         variant.sku,
         variant.shop_price::text AS "shopPrice",
         variant.retail_price::text AS "retailPrice",
         to_jsonb(variant) AS "variantData",
         to_jsonb(product) AS "productData"
       FROM recipe_ingredients ingredient
       LEFT JOIN catalog_variants variant ON variant.id = ingredient.catalog_variant_id
       LEFT JOIN catalog_products product ON product.id = variant.product_id
       WHERE ingredient.recipe_id = $1
       ORDER BY ingredient.sort_order, ingredient.created_at`,
      [recipeId],
    ),
  ]);

  const recipe = recipeResult.rows[0];
  if (!recipe) throw new OrderEngineError("RECIPE_NOT_FOUND", 404, "Recipe was not found");
  const recipeCost = buildRecipeCostPreview(
    recipe,
    ingredientResult.rows as RecipeCostIngredientInput[],
  );
  return {
    pricingCoverage: coverageResult.rows[0] || {},
    recipeCost,
    recordCount: recipeCost.calculatedLineCount,
  };
}

async function loadInventoryContext() {
  const db = getDb();
  const [summaryResult, itemResult] = await Promise.all([
    db.query(
      `SELECT
         count(*)::int AS "balanceCount",
         count(DISTINCT location_id)::int AS "locationCount",
         count(*) FILTER (WHERE available_quantity <= 0)::int AS "outOfStockCount",
         count(*) FILTER (
           WHERE available_quantity > 0 AND available_quantity <= reorder_point
         )::int AS "lowStockCount",
         COALESCE(sum(on_hand_quantity),0)::text AS "totalOnHand",
         COALESCE(sum(reserved_quantity),0)::text AS "totalReserved",
         COALESCE(sum(available_quantity),0)::text AS "totalAvailable"
       FROM inventory_balances`,
    ),
    db.query(
      `SELECT
         location.id::text AS "locationId",
         location.location_key AS "locationKey",
         location.name AS "locationName",
         product.name AS "productName",
         variant.id::text AS "variantId",
         variant.sku,
         variant.name AS "variantName",
         balance.on_hand_quantity::text AS "onHandQuantity",
         balance.reserved_quantity::text AS "reservedQuantity",
         balance.available_quantity::text AS "availableQuantity",
         balance.reorder_point::text AS "reorderPoint",
         balance.safety_stock::text AS "safetyStock",
         balance.unit,
         balance.last_counted_at AS "lastCountedAt",
         balance.updated_at AS "updatedAt",
         CASE
           WHEN balance.available_quantity <= 0 THEN 'out_of_stock'
           WHEN balance.available_quantity <= balance.reorder_point THEN 'low_stock'
           ELSE 'ok'
         END AS "stockStatus"
       FROM inventory_balances balance
       JOIN inventory_locations location ON location.id = balance.location_id
       JOIN catalog_variants variant ON variant.id = balance.catalog_variant_id
       JOIN catalog_products product ON product.id = variant.product_id
       WHERE location.status = 'active' AND variant.is_active = true
       ORDER BY
         CASE
           WHEN balance.available_quantity <= 0 THEN 0
           WHEN balance.available_quantity <= balance.reorder_point THEN 1
           ELSE 2
         END,
         balance.available_quantity ASC,
         product.name,
         variant.name
       LIMIT 100`,
    ),
  ]);

  const summary = summaryResult.rows[0] || {};
  return {
    summary,
    balances: itemResult.rows,
    recordCount: integer(summary.balanceCount),
  };
}

async function loadSupplierContext() {
  const db = getDb();
  const [summaryResult, offerResult] = await Promise.all([
    db.query(
      `SELECT
         (SELECT count(*)::int FROM suppliers WHERE status = 'active') AS "activeSupplierCount",
         (SELECT count(*)::int FROM supplier_catalog_offers WHERE is_active = true) AS "activeOfferCount",
         (SELECT count(DISTINCT catalog_variant_id)::int
            FROM supplier_catalog_offers WHERE is_active = true) AS "coveredVariantCount"`,
    ),
    db.query(
      `SELECT DISTINCT ON (variant.id)
         supplier.id::text AS "supplierId",
         supplier.supplier_code AS "supplierCode",
         supplier.name AS "supplierName",
         supplier.default_lead_time_days AS "supplierDefaultLeadTimeDays",
         supplier.minimum_order_value::text AS "supplierMinimumOrderValue",
         product.name AS "productName",
         variant.id::text AS "variantId",
         variant.sku,
         variant.name AS "variantName",
         offer.purchase_price::text AS "purchasePrice",
         offer.currency,
         offer.package_quantity::text AS "packageQuantity",
         offer.package_unit AS "packageUnit",
         offer.minimum_order_quantity::text AS "minimumOrderQuantity",
         COALESCE(offer.lead_time_days,supplier.default_lead_time_days) AS "leadTimeDays",
         offer.is_preferred AS "isPreferred",
         offer.valid_from AS "validFrom",
         offer.valid_until AS "validUntil",
         offer.updated_at AS "updatedAt"
       FROM supplier_catalog_offers offer
       JOIN suppliers supplier ON supplier.id = offer.supplier_id
       JOIN catalog_variants variant ON variant.id = offer.catalog_variant_id
       JOIN catalog_products product ON product.id = variant.product_id
       WHERE offer.is_active = true
         AND supplier.status = 'active'
         AND variant.is_active = true
         AND (offer.valid_from IS NULL OR offer.valid_from <= CURRENT_DATE)
         AND (offer.valid_until IS NULL OR offer.valid_until >= CURRENT_DATE)
       ORDER BY
         variant.id,
         offer.is_preferred DESC,
         offer.purchase_price ASC,
         COALESCE(offer.lead_time_days,supplier.default_lead_time_days,2147483647) ASC,
         offer.updated_at DESC
       LIMIT 100`,
    ),
  ]);

  const summary = summaryResult.rows[0] || {};
  return {
    summary,
    bestCurrentOffers: offerResult.rows,
    recordCount: integer(summary.activeOfferCount),
  };
}

export async function buildOperationalContext(
  identity: StaffIdentity,
  scopes: OperationalScope[],
  recipeId?: string,
): Promise<OperationalContext> {
  const selectedScopes = [...new Set(scopes)];
  const context: OperationalContext = {
    schemaVersion: "phase3-v1",
    generatedAt: new Date().toISOString(),
    scopes: selectedScopes,
    readiness: [],
  };

  if (selectedScopes.includes("catalog")) {
    await requirePermission(identity, "catalog.view");
    const catalog = await loadCatalogContext();
    context.catalog = { summary: catalog.summary, recentVariants: catalog.recentVariants };
    context.readiness.push(readiness(
      "catalog",
      catalog.recordCount,
      "Catalog active variants are available to AI.",
      "Catalog has no active variants.",
    ));
  }

  if (selectedScopes.includes("cost")) {
    await requirePermission(identity, "catalog.view");
    if (recipeId) await requirePermission(identity, "recipes.view");
    const cost = await loadCostContext(recipeId);
    context.cost = { pricingCoverage: cost.pricingCoverage, recipeCost: cost.recipeCost };
    context.readiness.push(readiness(
      "cost",
      cost.recordCount,
      "Pricing data is available for deterministic cost analysis.",
      recipeId
        ? "The selected Recipe has no deterministically calculated cost lines."
        : "Catalog has no variants with usable pricing.",
    ));
  }

  if (selectedScopes.includes("inventory")) {
    await requirePermission(identity, "inventory.view");
    const inventory = await loadInventoryContext();
    context.inventory = { summary: inventory.summary, balances: inventory.balances };
    context.readiness.push(readiness(
      "inventory",
      inventory.recordCount,
      "Inventory balances and reorder thresholds are available to AI.",
      "Inventory schema is ready but no balances have been entered. AI must not infer stock.",
    ));
  }

  if (selectedScopes.includes("suppliers")) {
    await requirePermission(identity, "suppliers.view");
    const suppliers = await loadSupplierContext();
    context.suppliers = { summary: suppliers.summary, bestCurrentOffers: suppliers.bestCurrentOffers };
    context.readiness.push(readiness(
      "suppliers",
      suppliers.recordCount,
      "Active supplier offers are available to AI.",
      "Supplier schema is ready but no active offers have been entered. AI must not infer purchase prices or lead times.",
    ));
  }

  return context;
}
