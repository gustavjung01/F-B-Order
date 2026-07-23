import { z } from "zod";
import { buildRecipeCostPreview, type RecipeCostPreview } from "../ai/recipe-cost.js";
import { OrderEngineError } from "../orders/order-errors.js";

const ingredientSchema = z.object({
  productName: z.string().trim().min(1).max(240),
  catalogVariantId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100000000),
  unit: z.string().trim().min(1).max(80),
  optional: z.boolean().default(false),
  note: z.string().trim().max(1000).nullable().optional(),
});

const stepSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(10000),
});

const generatedRecipeRdSchema = z.object({
  title: z.string().trim().min(3).max(200),
  rationale: z.string().trim().min(3).max(4000),
  proposal: z.object({
    yieldQuantity: z.coerce.number().positive().max(100000000),
    yieldUnit: z.string().trim().min(1).max(80),
    ingredients: z.array(ingredientSchema).min(1).max(250),
    steps: z.array(stepSchema).min(1).max(100),
  }),
  expectedEffects: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  risks: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  testPlan: z.array(z.object({
    metric: z.string().trim().min(1).max(240),
    target: z.string().trim().min(1).max(500),
    method: z.string().trim().min(1).max(1000),
  })).min(1).max(30),
});

const constraintSchema = z.object({
  maxCostPerYield: z.coerce.number().positive().nullable().optional(),
  preserveYield: z.boolean().default(false),
  useAvailableInventoryOnly: z.boolean().default(false),
  maxIngredientCount: z.coerce.number().int().positive().max(250).nullable().optional(),
});

const catalogRowSchema = z.object({
  variantId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  options: z.unknown(),
  status: z.string(),
  priceMode: z.string(),
  priceLabel: z.string().nullable(),
  isOrderable: z.boolean(),
  shopPrice: z.union([z.string(), z.number()]).nullable(),
  retailPrice: z.union([z.string(), z.number()]).nullable(),
  variantData: z.unknown(),
  productData: z.unknown(),
});

const baseIngredientSchema = z.object({
  productName: z.string(),
  quantity: z.union([z.string(), z.number()]).nullable(),
  unit: z.string().nullable(),
  optional: z.boolean(),
  catalogVariantId: z.string().uuid().nullable(),
});

const rdContextSchema = z.object({
  kind: z.literal("recipe_rd_request"),
  rdRequestId: z.string().uuid(),
  objective: z.string(),
  constraints: constraintSchema,
  recipe: z.object({
    id: z.string().uuid(),
    title: z.string(),
    currentVersionId: z.string().uuid(),
    currentVersionNo: z.number().int().positive(),
    yieldQuantity: z.union([z.string(), z.number()]).nullable(),
    yieldUnit: z.string().nullable(),
    ingredients: z.array(baseIngredientSchema).max(250),
    steps: z.array(z.object({ title: z.string().nullable(), content: z.string() })).max(100),
    snapshot: z.record(z.unknown()),
  }),
  catalog: z.array(catalogRowSchema).max(500),
  inventory: z.array(z.object({
    variantId: z.string().uuid(),
    availableQuantity: z.union([z.string(), z.number()]),
  })).max(500),
  baseCost: z.object({
    status: z.enum(["ready", "partial", "unavailable"]),
    costPerYield: z.number().nullable(),
    knownMandatoryCost: z.number(),
  }).passthrough(),
  kitchen: z.object({
    readiness: z.enum(["ready", "incomplete", "missing"]),
    profileVersionId: z.string().uuid().nullable(),
  }),
});

export type RecipeRdConstraints = z.infer<typeof constraintSchema>;
export type RecipeRdContext = z.infer<typeof rdContextSchema>;
export type GeneratedRecipeRdProposal = z.infer<typeof generatedRecipeRdSchema>;

export type RecipeRdConstraintResult = {
  key: "maxCostPerYield" | "preserveYield" | "useAvailableInventoryOnly" | "maxIngredientCount";
  status: "met" | "failed" | "unverifiable";
  message: string;
};

export type RecipeRdDraftContent = {
  schemaVersion: 1;
  kind: "recipe_rd";
  rdRequestId: string;
  targetRecipeId: string;
  baseRecipeVersionId: string;
  objective: string;
  constraints: RecipeRdConstraints;
  base: {
    versionNo: number;
    yieldQuantity: string | number | null;
    yieldUnit: string | null;
    ingredientCount: number;
    stepCount: number;
    cost: RecipeCostPreview;
  };
  proposal: {
    title: string;
    rationale: string;
    yieldQuantity: number;
    yieldUnit: string;
    ingredients: Array<{
      productName: string;
      quantity: number;
      unit: string;
      optional: boolean;
      note: string | null;
      catalogVariantId: string;
      catalogProductId: string;
      catalogSnapshot: {
        variantId: string;
        productId: string;
        productName: string;
        variantName: string;
        sku: string;
        options: unknown;
        status: string;
        priceMode: string;
        priceLabel: string | null;
        isOrderable: boolean;
      };
    }>;
    steps: Array<{ title: string; content: string; imageUrl: null }>;
    expectedEffects: string[];
    risks: string[];
    testPlan: Array<{ metric: string; target: string; method: string }>;
  };
  evaluation: {
    pricingBasis: "current_catalog_prices";
    cost: RecipeCostPreview;
    costPerYieldDelta: number | null;
    costPercentDelta: number | null;
    constraints: RecipeRdConstraintResult[];
    allRequiredConstraintsMet: boolean;
    inventory: Array<{ variantId: string; sku: string; availableQuantity: number; status: "available" | "unavailable" | "unknown" }>;
    capacity: {
      status: "base_profile_available" | "revalidation_required" | "unavailable";
      message: string;
    };
    changes: {
      yieldChanged: boolean;
      ingredientsAdded: number;
      ingredientsRemoved: number;
      ingredientsModified: number;
      stepsChanged: boolean;
    };
    warnings: Array<{ code: string; severity: "info" | "warning" | "high"; message: string }>;
  };
};

function stripJsonFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizedUnit(value: string | null): string {
  return String(value || "").trim().toLocaleLowerCase("vi-VN");
}

function ingredientKey(value: { catalogVariantId: string | null; productName: string }): string {
  return value.catalogVariantId || value.productName.trim().toLocaleLowerCase("vi-VN");
}

export function parseGeneratedRecipeRdProposal(text: string): GeneratedRecipeRdProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch {
    throw new OrderEngineError("AI_RECIPE_RD_INVALID_JSON", 422, "AI R&D proposal must be valid JSON.");
  }
  const result = generatedRecipeRdSchema.safeParse(parsed);
  if (!result.success) {
    throw new OrderEngineError(
      "AI_RECIPE_RD_INVALID_SHAPE",
      422,
      "AI R&D proposal does not match the required structure.",
      { issues: result.error.flatten() },
    );
  }
  return result.data;
}

export function buildRecipeRdDraftContent(generatedText: string, contextData: unknown): RecipeRdDraftContent {
  const contextResult = rdContextSchema.safeParse(contextData);
  if (!contextResult.success) {
    throw new OrderEngineError(
      "AI_RECIPE_RD_CONTEXT_INVALID",
      422,
      "Recipe R&D context is incomplete.",
      { issues: contextResult.error.flatten() },
    );
  }
  const context = contextResult.data;
  const generated = parseGeneratedRecipeRdProposal(generatedText);
  const catalogById = new Map(context.catalog.map((item) => [item.variantId, item]));
  const proposalIngredients = generated.proposal.ingredients.map((ingredient) => {
    const catalog = catalogById.get(ingredient.catalogVariantId);
    if (!catalog) {
      throw new OrderEngineError(
        "AI_RECIPE_RD_CATALOG_VARIANT_FORBIDDEN",
        422,
        `AI proposed a catalog variant outside the supplied context: ${ingredient.catalogVariantId}`,
      );
    }
    return {
      productName: catalog.variantName.trim().toLocaleLowerCase("vi-VN") === catalog.productName.trim().toLocaleLowerCase("vi-VN")
        ? catalog.productName
        : `${catalog.productName} — ${catalog.variantName}`,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      optional: ingredient.optional,
      note: ingredient.note?.trim() || null,
      catalogVariantId: catalog.variantId,
      catalogProductId: catalog.productId,
      catalogSnapshot: {
        variantId: catalog.variantId,
        productId: catalog.productId,
        productName: catalog.productName,
        variantName: catalog.variantName,
        sku: catalog.sku,
        options: catalog.options,
        status: catalog.status,
        priceMode: catalog.priceMode,
        priceLabel: catalog.priceLabel,
        isOrderable: catalog.isOrderable,
      },
    };
  });

  const cost = buildRecipeCostPreview(
    {
      id: context.recipe.id,
      title: generated.title,
      yieldQuantity: generated.proposal.yieldQuantity,
      yieldUnit: generated.proposal.yieldUnit,
    },
    proposalIngredients.map((ingredient) => {
      const catalog = catalogById.get(ingredient.catalogVariantId)!;
      return {
        productName: ingredient.productName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        optional: ingredient.optional,
        catalogVariantId: ingredient.catalogVariantId,
        sourceType: null,
        sourceRecipeSlug: null,
        sku: catalog.sku,
        shopPrice: catalog.shopPrice,
        retailPrice: catalog.retailPrice,
        variantData: catalog.variantData,
        productData: catalog.productData,
      };
    }),
  );

  const inventoryById = new Map(context.inventory.map((item) => [item.variantId, number(item.availableQuantity)]));
  const inventory = proposalIngredients.map((ingredient) => {
    const catalog = catalogById.get(ingredient.catalogVariantId)!;
    const available = inventoryById.get(ingredient.catalogVariantId);
    return {
      variantId: ingredient.catalogVariantId,
      sku: catalog.sku,
      availableQuantity: available ?? 0,
      status: available === undefined ? "unknown" as const : available > 0 ? "available" as const : "unavailable" as const,
    };
  });

  const constraints: RecipeRdConstraintResult[] = [];
  if (context.constraints.maxCostPerYield) {
    constraints.push(cost.costPerYield === null
      ? { key: "maxCostPerYield", status: "unverifiable", message: "Không tính đủ cost trên mỗi đơn vị yield." }
      : cost.costPerYield <= context.constraints.maxCostPerYield
        ? { key: "maxCostPerYield", status: "met", message: `Cost ${cost.costPerYield} không vượt trần ${context.constraints.maxCostPerYield}.` }
        : { key: "maxCostPerYield", status: "failed", message: `Cost ${cost.costPerYield} vượt trần ${context.constraints.maxCostPerYield}.` });
  }
  if (context.constraints.preserveYield) {
    const sameYield = number(context.recipe.yieldQuantity) === generated.proposal.yieldQuantity
      && normalizedUnit(context.recipe.yieldUnit) === normalizedUnit(generated.proposal.yieldUnit);
    constraints.push(sameYield
      ? { key: "preserveYield", status: "met", message: "Proposal giữ nguyên yield gốc." }
      : { key: "preserveYield", status: "failed", message: "Proposal đã thay đổi yield hoặc đơn vị yield." });
  }
  if (context.constraints.useAvailableInventoryOnly) {
    const unknown = inventory.some((item) => item.status === "unknown");
    const unavailable = inventory.filter((item) => item.status === "unavailable");
    constraints.push(unknown
      ? { key: "useAvailableInventoryOnly", status: "unverifiable", message: "Một số SKU chưa có dữ liệu tồn kho." }
      : unavailable.length
        ? { key: "useAvailableInventoryOnly", status: "failed", message: `${unavailable.length} SKU không có tồn khả dụng.` }
        : { key: "useAvailableInventoryOnly", status: "met", message: "Tất cả SKU đề xuất có tồn khả dụng lớn hơn 0." });
  }
  if (context.constraints.maxIngredientCount) {
    constraints.push(proposalIngredients.length <= context.constraints.maxIngredientCount
      ? { key: "maxIngredientCount", status: "met", message: `Số nguyên liệu ${proposalIngredients.length} nằm trong giới hạn.` }
      : { key: "maxIngredientCount", status: "failed", message: `Số nguyên liệu ${proposalIngredients.length} vượt giới hạn ${context.constraints.maxIngredientCount}.` });
  }

  const baseKeys = new Map(context.recipe.ingredients.map((item) => [ingredientKey(item), item]));
  const proposalKeys = new Map(proposalIngredients.map((item) => [ingredientKey(item), item]));
  let ingredientsAdded = 0;
  let ingredientsRemoved = 0;
  let ingredientsModified = 0;
  for (const [key, item] of proposalKeys) {
    const base = baseKeys.get(key);
    if (!base) ingredientsAdded += 1;
    else if (number(base.quantity) !== item.quantity || normalizedUnit(base.unit) !== normalizedUnit(item.unit) || base.optional !== item.optional) ingredientsModified += 1;
  }
  for (const key of baseKeys.keys()) if (!proposalKeys.has(key)) ingredientsRemoved += 1;
  const stepsChanged = JSON.stringify(context.recipe.steps.map((step) => ({ title: step.title || "", content: step.content })))
    !== JSON.stringify(generated.proposal.steps);
  const yieldChanged = number(context.recipe.yieldQuantity) !== generated.proposal.yieldQuantity
    || normalizedUnit(context.recipe.yieldUnit) !== normalizedUnit(generated.proposal.yieldUnit);

  const costPerYieldDelta = context.baseCost.costPerYield !== null && cost.costPerYield !== null
    ? round(cost.costPerYield - context.baseCost.costPerYield)
    : null;
  const costPercentDelta = context.baseCost.costPerYield && cost.costPerYield !== null
    ? round((cost.costPerYield - context.baseCost.costPerYield) / context.baseCost.costPerYield * 100)
    : null;
  const allRequiredConstraintsMet = constraints.every((item) => item.status === "met");
  const warnings: RecipeRdDraftContent["evaluation"]["warnings"] = [];
  if (cost.status !== "ready") warnings.push({ code: "COST_INCOMPLETE", severity: "high", message: "Proposal chưa tính đủ cost vì dữ liệu giá hoặc quy cách còn thiếu." });
  if (constraints.some((item) => item.status === "failed")) warnings.push({ code: "CONSTRAINT_FAILED", severity: "high", message: "Proposal vi phạm ít nhất một ràng buộc R&D." });
  if (constraints.some((item) => item.status === "unverifiable")) warnings.push({ code: "CONSTRAINT_UNVERIFIABLE", severity: "warning", message: "Có ràng buộc chưa thể kiểm chứng bằng dữ liệu hiện tại." });
  if (ingredientsRemoved > 0) warnings.push({ code: "INGREDIENT_REMOVED", severity: "warning", message: `Proposal loại bỏ ${ingredientsRemoved} nguyên liệu so với bản gốc.` });
  if (stepsChanged) warnings.push({ code: "CAPACITY_REVALIDATION_REQUIRED", severity: "warning", message: "Các bước làm thay đổi nên cần chạy lại mô phỏng năng lực bếp sau khi tạo version thử nghiệm." });

  return {
    schemaVersion: 1,
    kind: "recipe_rd",
    rdRequestId: context.rdRequestId,
    targetRecipeId: context.recipe.id,
    baseRecipeVersionId: context.recipe.currentVersionId,
    objective: context.objective,
    constraints: context.constraints,
    base: {
      versionNo: context.recipe.currentVersionNo,
      yieldQuantity: context.recipe.yieldQuantity,
      yieldUnit: context.recipe.yieldUnit,
      ingredientCount: context.recipe.ingredients.length,
      stepCount: context.recipe.steps.length,
      cost: context.baseCost as RecipeCostPreview,
    },
    proposal: {
      title: generated.title,
      rationale: generated.rationale,
      yieldQuantity: generated.proposal.yieldQuantity,
      yieldUnit: generated.proposal.yieldUnit,
      ingredients: proposalIngredients,
      steps: generated.proposal.steps.map((step) => ({ ...step, imageUrl: null })),
      expectedEffects: generated.expectedEffects,
      risks: generated.risks,
      testPlan: generated.testPlan,
    },
    evaluation: {
      pricingBasis: "current_catalog_prices",
      cost,
      costPerYieldDelta,
      costPercentDelta,
      constraints,
      allRequiredConstraintsMet,
      inventory,
      capacity: context.kitchen.readiness === "ready"
        ? {
            status: stepsChanged ? "revalidation_required" : "base_profile_available",
            message: stepsChanged
              ? "Base Recipe có operational profile, nhưng proposal đổi bước làm nên phải cấu hình hoặc xác nhận lại profile cho version thử nghiệm."
              : "Proposal giữ nguyên bước làm; có thể tham chiếu operational profile của version gốc và vẫn cần xác nhận thực tế.",
          }
        : { status: "unavailable", message: "Recipe Version gốc chưa có operational profile hoàn chỉnh." },
      changes: { yieldChanged, ingredientsAdded, ingredientsRemoved, ingredientsModified, stepsChanged },
      warnings,
    },
  };
}

export function readRecipeRdDraftContent(value: unknown): RecipeRdDraftContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderEngineError("AI_RECIPE_RD_CONTENT_INVALID", 409, "Stored Recipe R&D draft content is invalid.");
  }
  const content = value as Partial<RecipeRdDraftContent>;
  if (content.schemaVersion !== 1 || content.kind !== "recipe_rd" || typeof content.rdRequestId !== "string"
    || typeof content.targetRecipeId !== "string" || typeof content.baseRecipeVersionId !== "string"
    || !content.proposal || !Array.isArray(content.proposal.ingredients) || !Array.isArray(content.proposal.steps)
    || !content.evaluation) {
    throw new OrderEngineError("AI_RECIPE_RD_CONTENT_INVALID", 409, "Stored Recipe R&D draft content is invalid.");
  }
  return content as RecipeRdDraftContent;
}

export function isRecipeRdDraftContent(value: unknown): value is RecipeRdDraftContent {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === "recipe_rd"
    && (value as { schemaVersion?: unknown }).schemaVersion === 1);
}
