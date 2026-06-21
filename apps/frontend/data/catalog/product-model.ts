export type ProductSourceAccuracy = "company_crawl_confirmed" | "needs_company_sku_sheet";
export type ProductStatus = "active" | "draft" | "needs_review";
export type ProductType = "physical" | "bundle" | "recipe_content" | "service";
export type ProductCatalogKind = "sku_candidate" | "category_scaffold" | "content" | "bundle_candidate";

export type Product = {
  id: string;
  sku: string | null;
  barcode: string | null;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string;
  subcategoryId: string | null;
  industryGroup: string;
  productType: ProductType;
  catalogKind: ProductCatalogKind;
  shortDescription: string | null;
  description: string | null;
  origin: string | null;
  packageSize: string | null;
  unit: string | null;
  useCases: string[];
  tags: string[];
  sellingPoints: string[];
  storageInstruction: string | null;
  shelfLife: string | null;
  priceRetail: number | null;
  priceWholesale: number | null;
  currency: "VND";
  minOrderQty: number | null;
  imageUrls: string[];
  sourceUrls: string[];
  sourceAccuracy: ProductSourceAccuracy;
  sourceConfidence: "confirmed" | "public-snippet" | "inferred-category" | "todo";
  sourceStatusRaw: string;
  status: ProductStatus;
  isOrderable: boolean;
  dataIssues: string[];
};

export type PublicProduct = {
  itemKind: "product";
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  productType: ProductType;
  catalogKind: ProductCatalogKind;
  packageSizeLabel: string;
  unitLabel: string;
  priceLabel: string;
  imageUrl: string | null;
  shortDescription: string | null;
  useCases: string[];
  sellingPoints: string[];
  isOrderable: boolean;
  orderLabel: string;
};

export type PublicCatalogSuggestion = {
  itemKind: "suggestion";
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  suggestionType: "combo" | "menu_solution" | "content";
  imageUrl: string | null;
  shortDescription: string | null;
  useCases: string[];
  isOrderable: false;
  orderLabel: string;
};

export type PublicCatalogItem = PublicProduct | PublicCatalogSuggestion;

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type CategoryWithCount = Category & {
  productCount: number;
};
