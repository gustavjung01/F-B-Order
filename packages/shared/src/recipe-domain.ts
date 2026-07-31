export const RECIPE_STATUSES = ["draft", "in_review", "published", "archived"] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];

export const RECIPE_VISIBILITIES = ["public", "internal"] as const;
export type RecipeVisibility = (typeof RECIPE_VISIBILITIES)[number];

export const RECIPE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type RecipeDifficulty = (typeof RECIPE_DIFFICULTIES)[number];

export const RECIPE_CONTENT_SOURCES = ["human", "ai", "imported"] as const;
export type RecipeContentSource = (typeof RECIPE_CONTENT_SOURCES)[number];

export const RECIPE_INGREDIENT_SOURCE_TYPES = ["catalog", "external"] as const;
export type RecipeIngredientSourceType = (typeof RECIPE_INGREDIENT_SOURCE_TYPES)[number];

/**
 * Canonical units accepted by the deterministic scale/cost engines.
 * Display-only kitchen units such as "muỗng" must be normalized to one of
 * these units before a recipe can be published as calculation-ready.
 */
export const RECIPE_UNITS = ["g", "kg", "ml", "l", "piece", "portion", "pack"] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export const RECIPE_SEASON_TYPES = ["month_range", "festival", "weather", "always"] as const;
export type RecipeSeasonType = (typeof RECIPE_SEASON_TYPES)[number];

export const RECIPE_REVIEW_SEVERITIES = ["error", "warning", "suggestion"] as const;
export type RecipeReviewSeverity = (typeof RECIPE_REVIEW_SEVERITIES)[number];

export type RecipeSelections = Record<string, string>;

export type RecipeContentProvenance = {
  source: RecipeContentSource;
  aiRunId?: string | null;
  promptVersion?: string | null;
  importedSource?: string | null;
};

export type RecipeCatalogSnapshot = {
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  specification?: string | null;
  selectionKey?: string | null;
};

/**
 * Catalog link rules:
 * - productId identifies the Catalog V2 parent product.
 * - variantId identifies the sellable SKU used for cost/cart operations.
 * - selections + selectionKey preserve non-price choice identity such as flavor.
 * - cartReady is true only when variantId exists and every required selection is valid.
 */
export type RecipeCatalogLink = {
  productId: string;
  variantId?: string | null;
  selections: RecipeSelections;
  selectionKey: string;
  cartReady: boolean;
  snapshot: RecipeCatalogSnapshot;
};

export type RecipePackageConversion = {
  packageContentQuantity: number;
  packageContentUnit: RecipeUnit;
  wastePercent: number;
  usableYieldPercent: number;
};

export type RecipeIngredient = {
  id?: string;
  name: string;
  sourceType: RecipeIngredientSourceType;
  usageQuantity: number;
  usageUnit: RecipeUnit;
  packageConversion?: RecipePackageConversion | null;
  catalog?: RecipeCatalogLink | null;
  isOptional: boolean;
  sortOrder: number;
  note?: string | null;
  provenance: RecipeContentProvenance;
};

export type RecipeStep = {
  id?: string;
  title?: string | null;
  instruction: string;
  durationSeconds?: number | null;
  temperatureCelsius?: number | null;
  successMarker?: string | null;
  warning?: string | null;
  mediaUrl?: string | null;
  sortOrder: number;
  provenance: RecipeContentProvenance;
};

export type RecipeMistake = {
  id?: string;
  title: string;
  symptom: string;
  likelyCauses: string[];
  immediateFix?: string | null;
  prevention: string;
  relatedStepOrder?: number | null;
  severity: "low" | "medium" | "high";
  sortOrder: number;
  provenance: RecipeContentProvenance;
};

export type RecipeBusinessTip = {
  id?: string;
  title: string;
  recommendation: string;
  targetCustomer?: string | null;
  sellingMoment?: string | null;
  comboSuggestion?: string | null;
  packagingSuggestion?: string | null;
  storageSuggestion?: string | null;
  batchPreparationSuggestion?: string | null;
  sortOrder: number;
  provenance: RecipeContentProvenance;
};

export type RecipeSeasonalRule = {
  id?: string;
  type: RecipeSeasonType;
  title: string;
  startMonth?: number | null;
  endMonth?: number | null;
  festival?: string | null;
  weatherCondition?: string | null;
  regions: string[];
  suitabilityReason: string;
  marketingMessage?: string | null;
  priority: number;
  provenance: RecipeContentProvenance;
};

export type RecipeTag = {
  id?: string;
  slug: string;
  name: string;
};

export type RecipeDocument = {
  id?: string;
  slug: string;
  title: string;
  aliases: string[];
  shortDescription: string;
  categoryId?: string | null;
  status: RecipeStatus;
  visibility: RecipeVisibility;
  coverImageUrl?: string | null;
  difficulty: RecipeDifficulty;
  prepMinutes: number;
  cookMinutes: number;
  yieldQuantity: number;
  yieldUnit: RecipeUnit;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  mistakes: RecipeMistake[];
  businessTips: RecipeBusinessTip[];
  seasonalRules: RecipeSeasonalRule[];
  tags: RecipeTag[];
  provenance: RecipeContentProvenance;
};

export type RecipeVersionSnapshot = {
  recipeId: string;
  versionNumber: number;
  document: RecipeDocument;
  changeNote?: string | null;
  createdByStaffId: string;
  createdAt: string;
};

export type RecipeScaleRequest = {
  recipeId: string;
  targetYieldQuantity: number;
  targetYieldUnit: RecipeUnit;
};

export type RecipeScaledIngredient = {
  ingredientId?: string;
  name: string;
  usageQuantity: number;
  usageUnit: RecipeUnit;
  wasteAdjustedQuantity: number;
  purchasePackageCount?: number | null;
  leftoverQuantity?: number | null;
  warnings: string[];
};

export type RecipeScaleResult = {
  recipeId: string;
  sourceYieldQuantity: number;
  targetYieldQuantity: number;
  yieldUnit: RecipeUnit;
  scaleFactor: number;
  ingredients: RecipeScaledIngredient[];
  warnings: string[];
};

export type RecipeReviewFinding = {
  code: string;
  severity: RecipeReviewSeverity;
  section: "recipe" | "ingredient" | "step" | "mistake" | "business" | "seasonal";
  itemId?: string | null;
  message: string;
  recommendation?: string | null;
};
