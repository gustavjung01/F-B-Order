import type {
  RecipeApiBusinessTip,
  RecipeApiCard,
  RecipeApiCatalogReference,
  RecipeApiDetail,
  RecipeApiIngredient,
  RecipeApiMistake,
  RecipeApiProductLink,
  RecipeApiSeasonalRule,
  RecipeApiStep,
  RecipeApiTag,
  RecipeApiUnit,
} from "./recipe.types";

export type RecipeCardRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  cover_image_url: string | null;
  difficulty: "easy" | "medium" | "hard";
  prep_minutes: number;
  cook_minutes: number;
  yield_quantity: string | number;
  yield_unit: RecipeApiUnit;
  published_at: Date | string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: unknown;
  ingredient_count: number;
  step_count: number;
};

export type RecipeDetailRow = RecipeCardRow & {
  aliases: unknown;
};

export type RecipeIngredientRow = {
  id: string;
  name: string;
  source_type: "catalog" | "external";
  usage_quantity: string | number | null;
  usage_unit: RecipeApiUnit | null;
  package_content_quantity: string | number | null;
  package_content_unit: RecipeApiUnit | null;
  waste_percent: string | number;
  usable_yield_percent: string | number;
  default_selections: unknown;
  selection_key: string;
  is_optional: boolean;
  is_cart_ready: boolean;
  sort_order: number;
  note: string | null;
  catalog_product_id: string | null;
  catalog_variant_id: string | null;
  catalog_product_name_snapshot: string | null;
  catalog_variant_name_snapshot: string | null;
  sku_snapshot: string | null;
  specification_snapshot: string | null;
  selection_key_snapshot: string | null;
  current_product_name: string | null;
  current_product_status: string | null;
  current_variant_name: string | null;
  current_sku: string | null;
  current_variant_status: string | null;
  current_variant_options: unknown;
  current_variant_is_active: boolean | null;
  current_variant_is_public: boolean | null;
  current_variant_is_orderable: boolean | null;
};

export type RecipeStepRow = {
  id: string;
  title: string | null;
  instruction: string;
  duration_seconds: number | null;
  temperature_celsius: string | number | null;
  success_marker: string | null;
  warning: string | null;
  media_url: string | null;
  sort_order: number;
};

export type RecipeMistakeRow = {
  id: string;
  title: string;
  symptom: string;
  likely_causes: unknown;
  immediate_fix: string | null;
  prevention: string;
  related_step_order: number | null;
  severity: "low" | "medium" | "high";
  sort_order: number;
};

export type RecipeBusinessTipRow = {
  id: string;
  title: string;
  recommendation: string;
  target_customer: string | null;
  selling_moment: string | null;
  combo_suggestion: string | null;
  packaging_suggestion: string | null;
  storage_suggestion: string | null;
  batch_preparation_suggestion: string | null;
  sort_order: number;
};

export type RecipeSeasonalRuleRow = {
  id: string;
  rule_type: "month_range" | "festival" | "weather" | "always";
  title: string;
  start_month: number | null;
  end_month: number | null;
  festival: string | null;
  weather_condition: string | null;
  regions: unknown;
  suitability_reason: string;
  marketing_message: string | null;
  priority: number;
};

export type RecipeProductLinkRow = {
  id: string;
  catalog_product_id: string;
  catalog_variant_id: string | null;
  selections: unknown;
  selection_key: string;
  catalog_product_name_snapshot: string | null;
  catalog_variant_name_snapshot: string | null;
  sku_snapshot: string | null;
  specification_snapshot: string | null;
  note: string | null;
  sort_order: number;
  current_product_name: string | null;
  current_product_status: string | null;
  current_variant_name: string | null;
  current_sku: string | null;
  current_variant_status: string | null;
  current_variant_options: unknown;
  current_variant_is_active: boolean | null;
  current_variant_is_public: boolean | null;
  current_variant_is_orderable: boolean | null;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function selectionsRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objectRecord(value))
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, selected]) => [key, selected.trim()])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function tags(value: unknown): RecipeApiTag[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: RecipeApiTag[] = [];
  for (const item of value) {
    const record = objectRecord(item);
    const id = typeof record.id === "string" ? record.id : "";
    const slug = typeof record.slug === "string" ? record.slug : "";
    const name = typeof record.name === "string" ? record.name : "";
    if (!id || !slug || !name || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, slug, name });
  }
  return result;
}

function isoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function presentRecipeCard(row: RecipeCardRow): RecipeApiCard {
  const prepMinutes = Math.max(0, finiteNumber(row.prep_minutes));
  const cookMinutes = Math.max(0, finiteNumber(row.cook_minutes));
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    coverImageUrl: row.cover_image_url,
    difficulty: row.difficulty,
    prepMinutes,
    cookMinutes,
    totalMinutes: prepMinutes + cookMinutes,
    yieldQuantity: finiteNumber(row.yield_quantity),
    yieldUnit: row.yield_unit,
    category: row.category_id && row.category_slug && row.category_name
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name }
      : null,
    tags: tags(row.tags),
    ingredientCount: Math.max(0, finiteNumber(row.ingredient_count)),
    stepCount: Math.max(0, finiteNumber(row.step_count)),
    publishedAt: isoDate(row.published_at),
  };
}

function catalogAvailability(input: {
  productName: string | null;
  productStatus: string | null;
  variantId: string | null;
  variantName: string | null;
  variantStatus: string | null;
  variantIsActive: boolean | null;
  variantIsPublic: boolean | null;
}) {
  if (!input.productName) return "missing" as const;
  if (input.productStatus !== "active") return "inactive" as const;
  if (!input.variantId) return "available" as const;
  if (!input.variantName) return "missing" as const;
  if (
    input.variantIsActive !== true
    || input.variantIsPublic !== true
    || !["active", "market_price"].includes(input.variantStatus || "")
  ) {
    return "inactive" as const;
  }
  return "available" as const;
}

function presentCatalogReference(input: {
  productId: string;
  variantId: string | null;
  selections: unknown;
  selectionKey: string;
  savedCartReady: boolean;
  productNameSnapshot: string | null;
  variantNameSnapshot: string | null;
  skuSnapshot: string | null;
  specificationSnapshot: string | null;
  selectionKeySnapshot: string | null;
  currentProductName: string | null;
  currentProductStatus: string | null;
  currentVariantName: string | null;
  currentSku: string | null;
  currentVariantStatus: string | null;
  currentVariantOptions: unknown;
  currentVariantIsActive: boolean | null;
  currentVariantIsPublic: boolean | null;
  currentVariantIsOrderable: boolean | null;
}): RecipeApiCatalogReference {
  return {
    productId: input.productId,
    variantId: input.variantId,
    selections: selectionsRecord(input.selections),
    selectionKey: input.selectionKey,
    savedCartReady: input.savedCartReady,
    availability: catalogAvailability({
      productName: input.currentProductName,
      productStatus: input.currentProductStatus,
      variantId: input.variantId,
      variantName: input.currentVariantName,
      variantStatus: input.currentVariantStatus,
      variantIsActive: input.currentVariantIsActive,
      variantIsPublic: input.currentVariantIsPublic,
    }),
    snapshot: {
      productName: input.productNameSnapshot,
      variantName: input.variantNameSnapshot,
      sku: input.skuSnapshot,
      specification: input.specificationSnapshot,
      selectionKey: input.selectionKeySnapshot,
    },
    current: {
      productName: input.currentProductName,
      productStatus: input.currentProductStatus,
      variantName: input.currentVariantName,
      sku: input.currentSku,
      variantStatus: input.currentVariantStatus,
      options: objectRecord(input.currentVariantOptions),
      isActive: input.currentVariantIsActive === true,
      isPublic: input.currentVariantIsPublic === true,
      isOrderable: input.currentVariantIsOrderable === true,
    },
  };
}

export function presentRecipeIngredient(row: RecipeIngredientRow): RecipeApiIngredient {
  const packageContentQuantity = nullableNumber(row.package_content_quantity);
  const packageConversion = packageContentQuantity !== null && row.package_content_unit
    ? {
      packageContentQuantity,
      packageContentUnit: row.package_content_unit,
      wastePercent: finiteNumber(row.waste_percent),
      usableYieldPercent: finiteNumber(row.usable_yield_percent, 100),
    }
    : null;

  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    usageQuantity: nullableNumber(row.usage_quantity),
    usageUnit: row.usage_unit,
    packageConversion,
    catalog: row.source_type === "catalog" && row.catalog_product_id
      ? presentCatalogReference({
        productId: row.catalog_product_id,
        variantId: row.catalog_variant_id,
        selections: row.default_selections,
        selectionKey: row.selection_key,
        savedCartReady: row.is_cart_ready,
        productNameSnapshot: row.catalog_product_name_snapshot,
        variantNameSnapshot: row.catalog_variant_name_snapshot,
        skuSnapshot: row.sku_snapshot,
        specificationSnapshot: row.specification_snapshot,
        selectionKeySnapshot: row.selection_key_snapshot,
        currentProductName: row.current_product_name,
        currentProductStatus: row.current_product_status,
        currentVariantName: row.current_variant_name,
        currentSku: row.current_sku,
        currentVariantStatus: row.current_variant_status,
        currentVariantOptions: row.current_variant_options,
        currentVariantIsActive: row.current_variant_is_active,
        currentVariantIsPublic: row.current_variant_is_public,
        currentVariantIsOrderable: row.current_variant_is_orderable,
      })
      : null,
    isOptional: row.is_optional,
    sortOrder: row.sort_order,
    note: row.note,
  };
}

export function presentRecipeStep(row: RecipeStepRow): RecipeApiStep {
  return {
    id: row.id,
    title: row.title,
    instruction: row.instruction,
    durationSeconds: row.duration_seconds,
    temperatureCelsius: nullableNumber(row.temperature_celsius),
    successMarker: row.success_marker,
    warning: row.warning,
    mediaUrl: row.media_url,
    sortOrder: row.sort_order,
  };
}

export function presentRecipeMistake(row: RecipeMistakeRow): RecipeApiMistake {
  return {
    id: row.id,
    title: row.title,
    symptom: row.symptom,
    likelyCauses: stringList(row.likely_causes),
    immediateFix: row.immediate_fix,
    prevention: row.prevention,
    relatedStepOrder: row.related_step_order,
    severity: row.severity,
    sortOrder: row.sort_order,
  };
}

export function presentRecipeBusinessTip(row: RecipeBusinessTipRow): RecipeApiBusinessTip {
  return {
    id: row.id,
    title: row.title,
    recommendation: row.recommendation,
    targetCustomer: row.target_customer,
    sellingMoment: row.selling_moment,
    comboSuggestion: row.combo_suggestion,
    packagingSuggestion: row.packaging_suggestion,
    storageSuggestion: row.storage_suggestion,
    batchPreparationSuggestion: row.batch_preparation_suggestion,
    sortOrder: row.sort_order,
  };
}

export function presentRecipeSeasonalRule(row: RecipeSeasonalRuleRow): RecipeApiSeasonalRule {
  return {
    id: row.id,
    type: row.rule_type,
    title: row.title,
    startMonth: row.start_month,
    endMonth: row.end_month,
    festival: row.festival,
    weatherCondition: row.weather_condition,
    regions: stringList(row.regions),
    suitabilityReason: row.suitability_reason,
    marketingMessage: row.marketing_message,
    priority: row.priority,
  };
}

export function presentRecipeProductLink(row: RecipeProductLinkRow): RecipeApiProductLink {
  return {
    id: row.id,
    ...presentCatalogReference({
      productId: row.catalog_product_id,
      variantId: row.catalog_variant_id,
      selections: row.selections,
      selectionKey: row.selection_key,
      savedCartReady: false,
      productNameSnapshot: row.catalog_product_name_snapshot,
      variantNameSnapshot: row.catalog_variant_name_snapshot,
      skuSnapshot: row.sku_snapshot,
      specificationSnapshot: row.specification_snapshot,
      selectionKeySnapshot: row.selection_key,
      currentProductName: row.current_product_name,
      currentProductStatus: row.current_product_status,
      currentVariantName: row.current_variant_name,
      currentSku: row.current_sku,
      currentVariantStatus: row.current_variant_status,
      currentVariantOptions: row.current_variant_options,
      currentVariantIsActive: row.current_variant_is_active,
      currentVariantIsPublic: row.current_variant_is_public,
      currentVariantIsOrderable: row.current_variant_is_orderable,
    }),
    note: row.note,
    sortOrder: row.sort_order,
  };
}

export function presentRecipeDetail(input: {
  recipe: RecipeDetailRow;
  ingredients: RecipeIngredientRow[];
  steps: RecipeStepRow[];
  mistakes: RecipeMistakeRow[];
  businessTips: RecipeBusinessTipRow[];
  seasonalRules: RecipeSeasonalRuleRow[];
  productLinks: RecipeProductLinkRow[];
}): RecipeApiDetail {
  return {
    ...presentRecipeCard(input.recipe),
    aliases: stringList(input.recipe.aliases),
    ingredients: input.ingredients.map(presentRecipeIngredient),
    steps: input.steps.map(presentRecipeStep),
    mistakes: input.mistakes.map(presentRecipeMistake),
    businessTips: input.businessTips.map(presentRecipeBusinessTip),
    seasonalRules: input.seasonalRules.map(presentRecipeSeasonalRule),
    productLinks: input.productLinks.map(presentRecipeProductLink),
  };
}
