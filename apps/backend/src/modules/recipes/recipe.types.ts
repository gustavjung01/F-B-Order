export type RecipeApiUnit = "g" | "kg" | "ml" | "l" | "piece" | "portion" | "pack";
export type RecipeApiDifficulty = "easy" | "medium" | "hard";
export type RecipeApiIngredientSource = "catalog" | "external";

export type RecipeApiCategory = {
  id: string;
  slug: string;
  name: string;
} | null;

export type RecipeApiTag = {
  id: string;
  slug: string;
  name: string;
};

export type RecipeApiCard = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  coverImageUrl: string | null;
  difficulty: RecipeApiDifficulty;
  prepMinutes: number;
  cookMinutes: number;
  totalMinutes: number;
  yieldQuantity: number;
  yieldUnit: RecipeApiUnit;
  category: RecipeApiCategory;
  tags: RecipeApiTag[];
  ingredientCount: number;
  stepCount: number;
  publishedAt: string;
};

export type RecipeCatalogAvailability = "available" | "inactive" | "missing";

export type RecipeApiCatalogReference = {
  productId: string;
  variantId: string | null;
  selections: Record<string, string>;
  selectionKey: string;
  savedCartReady: boolean;
  availability: RecipeCatalogAvailability;
  snapshot: {
    productName: string | null;
    variantName: string | null;
    sku: string | null;
    specification: string | null;
    selectionKey: string | null;
  };
  current: {
    productName: string | null;
    productStatus: string | null;
    variantName: string | null;
    sku: string | null;
    variantStatus: string | null;
    options: Record<string, unknown>;
    isActive: boolean;
    isPublic: boolean;
    isOrderable: boolean;
  };
};

export type RecipeApiIngredient = {
  id: string;
  name: string;
  sourceType: RecipeApiIngredientSource;
  usageQuantity: number | null;
  usageUnit: RecipeApiUnit | null;
  packageConversion: {
    packageContentQuantity: number;
    packageContentUnit: RecipeApiUnit;
    wastePercent: number;
    usableYieldPercent: number;
  } | null;
  catalog: RecipeApiCatalogReference | null;
  isOptional: boolean;
  sortOrder: number;
  note: string | null;
};

export type RecipeApiStep = {
  id: string;
  title: string | null;
  instruction: string;
  durationSeconds: number | null;
  temperatureCelsius: number | null;
  successMarker: string | null;
  warning: string | null;
  mediaUrl: string | null;
  sortOrder: number;
};

export type RecipeApiMistake = {
  id: string;
  title: string;
  symptom: string;
  likelyCauses: string[];
  immediateFix: string | null;
  prevention: string;
  relatedStepOrder: number | null;
  severity: "low" | "medium" | "high";
  sortOrder: number;
};

export type RecipeApiBusinessTip = {
  id: string;
  title: string;
  recommendation: string;
  targetCustomer: string | null;
  sellingMoment: string | null;
  comboSuggestion: string | null;
  packagingSuggestion: string | null;
  storageSuggestion: string | null;
  batchPreparationSuggestion: string | null;
  sortOrder: number;
};

export type RecipeApiSeasonalRule = {
  id: string;
  type: "month_range" | "festival" | "weather" | "always";
  title: string;
  startMonth: number | null;
  endMonth: number | null;
  festival: string | null;
  weatherCondition: string | null;
  regions: string[];
  suitabilityReason: string;
  marketingMessage: string | null;
  priority: number;
};

export type RecipeApiProductLink = RecipeApiCatalogReference & {
  id: string;
  note: string | null;
  sortOrder: number;
};

export type RecipeApiDetail = RecipeApiCard & {
  aliases: string[];
  ingredients: RecipeApiIngredient[];
  steps: RecipeApiStep[];
  mistakes: RecipeApiMistake[];
  businessTips: RecipeApiBusinessTip[];
  seasonalRules: RecipeApiSeasonalRule[];
  productLinks: RecipeApiProductLink[];
};

export type RecipeListFilters = {
  query: string | null;
  category: string | null;
  tag: string | null;
  limit: number;
  offset: number;
};

export type RecipeListResult = {
  recipes: RecipeApiCard[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};
