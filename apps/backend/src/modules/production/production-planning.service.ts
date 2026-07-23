import type { Pool } from "pg";
import { getDb } from "../../db/pool.js";
import { requireAdmin } from "../admin/admin-access.js";
import { calculateRecipeCostLine, type RecipeCostIngredientInput } from "../ai/recipe-cost.js";
import type { StaffIdentity } from "../auth/auth.identity.js";
import { simulateKitchenCapacity } from "../kitchen/kitchen-capacity.service.js";
import { OrderEngineError } from "../orders/order-errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductionPlanLineInput = {
  recipeId: string;
  versionId?: string | null;
  targetQuantity: number;
};

export type ProductionPlanInput = {
  shiftMinutes: number;
  lines: ProductionPlanLineInput[];
};

type SnapshotIngredient = {
  productName?: unknown;
  quantity?: unknown;
  unit?: unknown;
  optional?: unknown;
  catalogVariantId?: unknown;
  sourceType?: unknown;
  sourceRecipeSlug?: unknown;
};

type RecipeSnapshot = {
  yieldQuantity?: unknown;
  yieldUnit?: unknown;
  ingredients?: unknown;
};

type RecipeVersionRow = {
  recipeId: string;
  recipeTitle: string;
  versionId: string;
  versionNo: number;
  workflowStatus: string;
  snapshot: RecipeSnapshot;
};

type CatalogRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  shopPrice: string | null;
  retailPrice: string | null;
  variantData: unknown;
  productData: unknown;
};

type InventoryRow = {
  variantId: string;
  availablePackages: string | null;
};

type SupplierRow = {
  variantId: string;
  supplierId: string;
  supplierName: string;
  purchasePrice: string;
  currency: string;
  minimumOrderQuantity: string;
  leadTimeDays: number | null;
};

type PlanWarning = {
  code: string;
  severity: "info" | "warning" | "high";
  message: string;
  recipeId?: string;
  variantId?: string;
};

type CapacityStep = {
  station: { id: string; name: string };
  elapsedMinutes: number | null;
  blockedReason: string | null;
};

type CapacityBaseline = {
  feasible: boolean;
  blocked: boolean;
  estimatedCompletionMinutes: number | null;
  capacityPerShift: number;
  lineThroughputPerHour: number;
  maxUtilization: number;
  bottleneck: { stepName: string; stationName: string; throughputPerHour: number } | null;
  warnings: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }>;
  steps: CapacityStep[];
};

type IngredientAggregate = {
  variantId: string;
  sku: string;
  productName: string;
  requiredPackageEquivalent: number;
  mandatory: boolean;
  recipeTitles: Set<string>;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeUuid(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(normalized)) {
    throw new OrderEngineError("PRODUCTION_PLAN_INVALID_ID", 400, `${field} must be a UUID.`, { field });
  }
  return normalized;
}

function positive(value: unknown, field: string, max = 100000000): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new OrderEngineError("PRODUCTION_PLAN_NUMBER_INVALID", 400, `${field} must be a positive number.`, { field });
  }
  return round(parsed);
}

function normalizeInput(input: ProductionPlanInput) {
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 20) {
    throw new OrderEngineError("PRODUCTION_PLAN_LINES_INVALID", 400, "lines must contain between 1 and 20 Recipe targets.");
  }
  const shiftMinutes = positive(input.shiftMinutes, "shiftMinutes", 10080);
  const grouped = new Map<string, { recipeId: string; versionId: string | null; targetQuantity: number }>();
  input.lines.forEach((line, index) => {
    const recipeId = normalizeUuid(line.recipeId, `lines[${index}].recipeId`);
    const versionId = line.versionId ? normalizeUuid(line.versionId, `lines[${index}].versionId`) : null;
    const targetQuantity = positive(line.targetQuantity, `lines[${index}].targetQuantity`);
    const key = `${recipeId}:${versionId || "current"}`;
    const current = grouped.get(key);
    grouped.set(key, {
      recipeId,
      versionId,
      targetQuantity: round((current?.targetQuantity || 0) + targetQuantity),
    });
  });
  return { shiftMinutes, lines: [...grouped.values()] };
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function snapshotIngredients(snapshot: RecipeSnapshot): SnapshotIngredient[] {
  if (!Array.isArray(snapshot.ingredients)) return [];
  return snapshot.ingredients.filter((item): item is SnapshotIngredient => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

async function loadRecipeVersion(db: Pool, recipeId: string, versionId: string | null): Promise<RecipeVersionRow> {
  const result = await db.query<RecipeVersionRow>(
    `SELECT
       recipe.id::text AS "recipeId",
       recipe.title AS "recipeTitle",
       version.id::text AS "versionId",
       version.version_no AS "versionNo",
       version.workflow_status AS "workflowStatus",
       version.snapshot
     FROM recipes recipe
     JOIN recipe_versions version
       ON version.recipe_id=recipe.id
      AND version.id=COALESCE($2::uuid,recipe.current_version_id)
     WHERE recipe.id=$1 AND recipe.status <> 'inactive'`,
    [recipeId, versionId],
  );
  const row = result.rows[0];
  if (!row) throw new OrderEngineError("PRODUCTION_PLAN_RECIPE_VERSION_NOT_FOUND", 404, "Recipe Version was not found.", { recipeId, versionId });
  return row;
}

async function loadCatalog(db: Pool, variantIds: string[]): Promise<Map<string, CatalogRow>> {
  if (!variantIds.length) return new Map();
  const result = await db.query<CatalogRow>(
    `SELECT
       variant.id::text AS "variantId",
       product.id::text AS "productId",
       product.name AS "productName",
       variant.name AS "variantName",
       variant.sku,
       variant.shop_price::text AS "shopPrice",
       variant.retail_price::text AS "retailPrice",
       to_jsonb(variant) AS "variantData",
       to_jsonb(product) AS "productData"
     FROM catalog_variants variant
     JOIN catalog_products product ON product.id=variant.product_id
     WHERE variant.id=ANY($1::uuid[])`,
    [variantIds],
  );
  return new Map(result.rows.map((row) => [row.variantId, row]));
}

async function loadInventory(db: Pool, variantIds: string[]): Promise<Map<string, number | null>> {
  if (!variantIds.length) return new Map();
  const result = await db.query<InventoryRow>(
    `SELECT
       variant.id::text AS "variantId",
       CASE WHEN count(balance.location_id)=0 THEN NULL
            ELSE COALESCE(sum(balance.available_quantity),0)::text END AS "availablePackages"
     FROM catalog_variants variant
     LEFT JOIN inventory_balances balance ON balance.catalog_variant_id=variant.id
     WHERE variant.id=ANY($1::uuid[])
     GROUP BY variant.id`,
    [variantIds],
  );
  return new Map(result.rows.map((row) => [row.variantId, numberValue(row.availablePackages)]));
}

async function loadSuppliers(db: Pool, variantIds: string[]): Promise<Map<string, SupplierRow>> {
  if (!variantIds.length) return new Map();
  const result = await db.query<SupplierRow>(
    `SELECT DISTINCT ON (offer.catalog_variant_id)
       offer.catalog_variant_id::text AS "variantId",
       supplier.id::text AS "supplierId",
       supplier.name AS "supplierName",
       offer.purchase_price::text AS "purchasePrice",
       offer.currency,
       offer.minimum_order_quantity::text AS "minimumOrderQuantity",
       COALESCE(offer.lead_time_days,supplier.default_lead_time_days) AS "leadTimeDays"
     FROM supplier_catalog_offers offer
     JOIN suppliers supplier ON supplier.id=offer.supplier_id
     WHERE offer.catalog_variant_id=ANY($1::uuid[])
       AND offer.is_active=true
       AND supplier.status='active'
       AND (offer.valid_from IS NULL OR offer.valid_from<=CURRENT_DATE)
       AND (offer.valid_until IS NULL OR offer.valid_until>=CURRENT_DATE)
     ORDER BY offer.catalog_variant_id,offer.is_preferred DESC,offer.purchase_price ASC`,
    [variantIds],
  );
  return new Map(result.rows.map((row) => [row.variantId, row]));
}

export async function buildProductionPlan(
  identity: StaffIdentity,
  input: ProductionPlanInput,
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const normalized = normalizeInput(input);
  const warnings: PlanWarning[] = [];
  const recipeDocuments: Array<{
    recipeId: string;
    recipeTitle: string;
    versionId: string;
    versionNo: number;
    workflowStatus: string;
    targetQuantity: number;
    yieldQuantity: number | null;
    yieldUnit: string | null;
    scaleFactor: number | null;
    ingredientStatus: "ready" | "blocked";
    capacityStatus: "ready" | "blocked" | "missing";
    capacity: CapacityBaseline | null;
  }> = [];
  const ingredients = new Map<string, IngredientAggregate>();
  const stationLoads = new Map<string, { stationId: string; stationName: string; loadMinutes: number; recipeTitles: Set<string>; blocked: boolean }>();
  let blockerCount = 0;

  for (const line of normalized.lines) {
    const version = await loadRecipeVersion(db, line.recipeId, line.versionId);
    const yieldQuantity = numberValue(version.snapshot.yieldQuantity);
    const yieldUnit = typeof version.snapshot.yieldUnit === "string" ? version.snapshot.yieldUnit : null;
    const scaleFactor = yieldQuantity && yieldQuantity > 0 ? line.targetQuantity / yieldQuantity : null;
    let ingredientStatus: "ready" | "blocked" = "ready";

    if (!scaleFactor) {
      ingredientStatus = "blocked";
      blockerCount += 1;
      warnings.push({
        code: "RECIPE_YIELD_MISSING",
        severity: "high",
        message: `${version.recipeTitle} chưa có yield hợp lệ nên không thể scale nguyên liệu.`,
        recipeId: version.recipeId,
      });
    }

    const rawIngredients = snapshotIngredients(version.snapshot);
    const variantIds = [...new Set(rawIngredients
      .map((item) => typeof item.catalogVariantId === "string" ? item.catalogVariantId : null)
      .filter((value): value is string => Boolean(value && UUID_PATTERN.test(value))))];
    const catalog = await loadCatalog(db, variantIds);

    for (const [index, item] of rawIngredients.entries()) {
      const optional = item.optional === true;
      const variantId = typeof item.catalogVariantId === "string" && UUID_PATTERN.test(item.catalogVariantId)
        ? item.catalogVariantId.toLowerCase()
        : null;
      const catalogItem = variantId ? catalog.get(variantId) : null;
      const costInput: RecipeCostIngredientInput = {
        productName: typeof item.productName === "string" && item.productName.trim() ? item.productName.trim() : `Nguyên liệu ${index + 1}`,
        quantity: typeof item.quantity === "number" || typeof item.quantity === "string" ? item.quantity : null,
        unit: typeof item.unit === "string" ? item.unit : null,
        optional,
        catalogVariantId: variantId,
        sourceType: typeof item.sourceType === "string" ? item.sourceType : null,
        sourceRecipeSlug: typeof item.sourceRecipeSlug === "string" ? item.sourceRecipeSlug : null,
        sku: catalogItem?.sku ?? null,
        shopPrice: catalogItem?.shopPrice ?? null,
        retailPrice: catalogItem?.retailPrice ?? null,
        variantData: catalogItem?.variantData ?? null,
        productData: catalogItem?.productData ?? null,
      };
      const costLine = calculateRecipeCostLine(costInput);
      if (!scaleFactor || costLine.status !== "calculated" || !variantId || !catalogItem || !costLine.packagePrice || costLine.lineCost === null) {
        if (!optional) {
          ingredientStatus = "blocked";
          blockerCount += 1;
        }
        warnings.push({
          code: `INGREDIENT_${costLine.status.toUpperCase()}`,
          severity: optional ? "warning" : "high",
          message: `${version.recipeTitle}: ${costInput.productName} — ${costLine.reason || "Không thể quy đổi nhu cầu nguyên liệu."}`,
          recipeId: version.recipeId,
          variantId: variantId || undefined,
        });
        continue;
      }
      const packageEquivalent = round(costLine.lineCost / costLine.packagePrice * scaleFactor, 6);
      const current = ingredients.get(variantId);
      if (current) {
        current.requiredPackageEquivalent = round(current.requiredPackageEquivalent + packageEquivalent, 6);
        current.mandatory = current.mandatory || !optional;
        current.recipeTitles.add(version.recipeTitle);
      } else {
        ingredients.set(variantId, {
          variantId,
          sku: catalogItem.sku,
          productName: catalogItem.variantName.trim().toLocaleLowerCase("vi-VN") === catalogItem.productName.trim().toLocaleLowerCase("vi-VN")
            ? catalogItem.productName
            : `${catalogItem.productName} — ${catalogItem.variantName}`,
          requiredPackageEquivalent: packageEquivalent,
          mandatory: !optional,
          recipeTitles: new Set([version.recipeTitle]),
        });
      }
    }

    const capacityResult = await simulateKitchenCapacity(identity, {
      recipeId: version.recipeId,
      versionId: version.versionId,
      targetQuantity: line.targetQuantity,
      shiftMinutes: normalized.shiftMinutes,
    }, db);
    const baseline = "baseline" in capacityResult ? capacityResult.baseline as CapacityBaseline : null;
    const capacityStatus: "ready" | "blocked" | "missing" = !baseline
      ? "missing"
      : baseline.blocked || !baseline.feasible
        ? "blocked"
        : "ready";

    if (!baseline) {
      blockerCount += 1;
      warnings.push({
        code: "CAPACITY_PROFILE_MISSING",
        severity: "high",
        message: `${version.recipeTitle} chưa có operational profile hoàn chỉnh.`,
        recipeId: version.recipeId,
      });
    } else {
      if (!baseline.feasible) blockerCount += 1;
      for (const warning of baseline.warnings) {
        warnings.push({ ...warning, message: `${version.recipeTitle}: ${warning.message}`, recipeId: version.recipeId });
      }
      for (const step of baseline.steps) {
        const current = stationLoads.get(step.station.id);
        const loadMinutes = step.elapsedMinutes ?? 0;
        if (current) {
          current.loadMinutes = round(current.loadMinutes + loadMinutes);
          current.recipeTitles.add(version.recipeTitle);
          current.blocked = current.blocked || Boolean(step.blockedReason);
        } else {
          stationLoads.set(step.station.id, {
            stationId: step.station.id,
            stationName: step.station.name,
            loadMinutes,
            recipeTitles: new Set([version.recipeTitle]),
            blocked: Boolean(step.blockedReason),
          });
        }
      }
    }

    recipeDocuments.push({
      recipeId: version.recipeId,
      recipeTitle: version.recipeTitle,
      versionId: version.versionId,
      versionNo: version.versionNo,
      workflowStatus: version.workflowStatus,
      targetQuantity: line.targetQuantity,
      yieldQuantity: yieldQuantity && yieldQuantity > 0 ? yieldQuantity : null,
      yieldUnit,
      scaleFactor: scaleFactor ? round(scaleFactor, 6) : null,
      ingredientStatus,
      capacityStatus,
      capacity: baseline,
    });
  }

  const variantIds = [...ingredients.keys()];
  const [inventory, suppliers] = await Promise.all([
    loadInventory(db, variantIds),
    loadSuppliers(db, variantIds),
  ]);

  let shortageSkuCount = 0;
  let unknownInventorySkuCount = 0;
  let estimatedPurchaseCost = 0;
  let needsPurchase = false;
  const ingredientDocuments = [...ingredients.values()].map((item) => {
    const requiredPackages = Math.ceil(item.requiredPackageEquivalent - 1e-9);
    const available = inventory.get(item.variantId) ?? null;
    const supplier = suppliers.get(item.variantId) ?? null;
    const shortagePackages = available === null ? null : Math.max(0, requiredPackages - Math.floor(available));
    const minimumOrderQuantity = supplier ? Math.ceil(numberValue(supplier.minimumOrderQuantity) || 1) : null;
    const recommendedOrderPackages = shortagePackages && shortagePackages > 0 && supplier
      ? Math.max(shortagePackages, minimumOrderQuantity || 1)
      : 0;
    const purchaseCost = supplier && recommendedOrderPackages > 0
      ? round(recommendedOrderPackages * (numberValue(supplier.purchasePrice) || 0), 2)
      : 0;
    estimatedPurchaseCost += purchaseCost;

    let status: "available" | "shortage" | "unknown" = "available";
    if (available === null) {
      status = "unknown";
      unknownInventorySkuCount += 1;
      if (item.mandatory) blockerCount += 1;
      warnings.push({
        code: "INVENTORY_UNKNOWN",
        severity: item.mandatory ? "high" : "warning",
        message: `${item.productName} chưa có dữ liệu tồn kho; hệ thống không giả định tồn bằng 0.`,
        variantId: item.variantId,
      });
    } else if ((shortagePackages || 0) > 0) {
      status = "shortage";
      shortageSkuCount += 1;
      if (item.mandatory) needsPurchase = true;
      if (item.mandatory && !supplier) {
        blockerCount += 1;
        warnings.push({
          code: "SUPPLIER_MISSING_FOR_SHORTAGE",
          severity: "high",
          message: `${item.productName} thiếu ${shortagePackages} package nhưng chưa có offer nhà cung cấp hợp lệ.`,
          variantId: item.variantId,
        });
      }
    }

    return {
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      mandatory: item.mandatory,
      recipeTitles: [...item.recipeTitles].sort(),
      requiredPackageEquivalent: round(item.requiredPackageEquivalent, 6),
      requiredPackages,
      availablePackages: available,
      shortagePackages,
      status,
      supplier: supplier ? {
        id: supplier.supplierId,
        name: supplier.supplierName,
        purchasePrice: numberValue(supplier.purchasePrice),
        currency: supplier.currency,
        minimumOrderQuantity,
        leadTimeDays: supplier.leadTimeDays,
        recommendedOrderPackages,
        estimatedPurchaseCost: purchaseCost,
      } : null,
    };
  });

  const stationDocuments = [...stationLoads.values()]
    .map((station) => ({
      stationId: station.stationId,
      stationName: station.stationName,
      loadMinutes: round(station.loadMinutes),
      shiftMinutes: normalized.shiftMinutes,
      utilization: round(station.loadMinutes / normalized.shiftMinutes, 3),
      feasible: !station.blocked && station.loadMinutes <= normalized.shiftMinutes,
      recipeTitles: [...station.recipeTitles].sort(),
    }))
    .sort((a, b) => b.utilization - a.utilization);

  for (const station of stationDocuments) {
    if (!station.feasible) {
      blockerCount += 1;
      warnings.push({
        code: "SHARED_STATION_OVER_CAPACITY",
        severity: "high",
        message: `${station.stationName} cần ${station.loadMinutes} phút cho nhiều Recipe trong ca ${normalized.shiftMinutes} phút.`,
      });
    }
  }

  const status = blockerCount > 0 ? "blocked" as const : needsPurchase ? "needs_purchase" as const : "ready" as const;
  return {
    schemaVersion: "production-plan-v1",
    model: "deterministic_multi_recipe_v1",
    generatedAt: new Date().toISOString(),
    status,
    assumptions: [
      "Mỗi target được scale từ yield của Recipe Version đã chọn.",
      "Quy đổi package dùng cùng dữ liệu Catalog và logic đơn vị với giá vốn Recipe.",
      "Tồn kho lấy tổng available_quantity; SKU không có dòng tồn kho được đánh dấu unknown, không coi là 0.",
      "Tải nhiều Recipe dùng chung station được cộng trong cùng ca để phát hiện quá tải.",
      "Kết quả chỉ là kế hoạch đọc; hệ thống không tự giữ kho, tạo purchase order, phân ca hoặc đổi Recipe.",
    ],
    input: normalized,
    summary: {
      recipeCount: recipeDocuments.length,
      ingredientSkuCount: ingredientDocuments.length,
      shortageSkuCount,
      unknownInventorySkuCount,
      estimatedPurchaseCost: round(estimatedPurchaseCost, 2),
      currency: "VND",
      blockerCount,
      bottleneckStation: stationDocuments[0] ?? null,
    },
    recipes: recipeDocuments,
    ingredients: ingredientDocuments.sort((a, b) => a.status.localeCompare(b.status) || a.productName.localeCompare(b.productName, "vi")),
    stations: stationDocuments,
    warnings,
  };
}

export async function enqueueProductionPlanAnalysis(
  identity: StaffIdentity,
  input: ProductionPlanInput & { prompt?: string | null },
  db: Pool = getDb(),
) {
  requireAdmin(identity);
  const plan = await buildProductionPlan(identity, input, db);
  const prompt = typeof input.prompt === "string" && input.prompt.trim()
    ? input.prompt.trim().slice(0, 4000)
    : "Giải thích kế hoạch sản xuất, điểm nghẽn công suất, nguyên liệu thiếu, dữ liệu chưa xác minh và thứ tự việc con người cần xử lý. Không đề xuất tự động thực thi.";
  const result = await db.query<{ id: string }>(
    `INSERT INTO ai_jobs(staff_user_id,job_type,prompt,context_scope,context_data)
     VALUES($1,'read_only',$2,$3,$4::jsonb)
     RETURNING id::text`,
    [
      identity.staffId,
      prompt,
      ["recipe_versions", "kitchen_capacity", "inventory", "suppliers", "production_planning"],
      JSON.stringify({
        kind: "production_plan_analysis",
        instruction: "Use only the deterministic production plan supplied by the backend. Do not invent demand, yield, stock, supplier terms, processing times, staffing, equipment, or prices. Clearly separate blockers, purchase needs, and unknown data. Never execute operational changes.",
        policy: {
          readOnly: true,
          mayReserveInventory: false,
          mayCreatePurchaseOrder: false,
          mayAssignStaff: false,
          mayChangeRecipe: false,
        },
        plan,
      }),
    ],
  );
  return { jobId: result.rows[0].id, status: "pending" as const, plan };
}
