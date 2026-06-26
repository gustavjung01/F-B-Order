import type { RecipeUnit } from "./public-card-model";

export type RecipeCatalogAvailability = "available" | "inactive" | "missing";

export type PublicRecipeCatalogReference = {
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

export type PublicRecipeIngredient = {
  id: string;
  name: string;
  sourceType: "catalog" | "external";
  usageQuantity: number | null;
  usageUnit: RecipeUnit | null;
  packageConversion: {
    packageContentQuantity: number;
    packageContentUnit: RecipeUnit;
    wastePercent: number;
    usableYieldPercent: number;
  } | null;
  catalog: PublicRecipeCatalogReference | null;
  isOptional: boolean;
  sortOrder: number;
  note: string | null;
};
