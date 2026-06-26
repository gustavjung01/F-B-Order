import type { PublicRecipeCard } from "./public-card-model";
import type { PublicRecipeCatalogReference, PublicRecipeIngredient } from "./public-catalog-model";

export type PublicRecipeStep = {
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

export type PublicRecipeMistake = {
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

export type PublicRecipeBusinessTip = {
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

export type PublicRecipeSeasonalRule = {
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

export type PublicRecipeProductLink = PublicRecipeCatalogReference & {
  id: string;
  note: string | null;
  sortOrder: number;
};

export type PublicRecipeDetail = PublicRecipeCard & {
  aliases: string[];
  ingredients: PublicRecipeIngredient[];
  steps: PublicRecipeStep[];
  mistakes: PublicRecipeMistake[];
  businessTips: PublicRecipeBusinessTip[];
  seasonalRules: PublicRecipeSeasonalRule[];
  productLinks: PublicRecipeProductLink[];
};

export type PublicRecipeListResponse = {
  recipes: PublicRecipeCard[];
  total: number;
  pagination: { limit: number; offset: number; hasMore: boolean };
};

export type PublicRecipeDetailResponse = { recipe: PublicRecipeDetail };
export type RelatedRecipeResponse = { recipes: PublicRecipeCard[]; total: number };
