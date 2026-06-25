export type CatalogV2Pricing = {
  visibility: "visible" | "label" | "hidden";
  label: string | null;
  amount: number | null;
  currency: "VND";
  source: "dealer" | "market" | null;
  canOrder: boolean;
  reason: string | null;
};

export type CatalogV2Image = {
  key: string | null;
  objectKey: string | null;
  url: string | null;
};

export type CatalogV2VariantCard = {
  id: string;
  variant_id: string;
  variantId: string;
  product_id: string;
  productId: string;
  productKey: string;
  variantKey: string;
  sku: string;
  name: string;
  productName: string;
  brand: string | null;
  industry: string;
  industryKey: string;
  subcategory: string | null;
  options: Record<string, string>;
  sizeLabel: string | null;
  packageLabel: string | null;
  sellUnit: string | null;
  specificationLabel: string | null;
  shortDescription?: string | null;
  commercialDataConfidence?: "high" | "medium" | null;
  priceMode: "fixed" | "market";
  price: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  variantCount?: number;
  priceLabel: string | null;
  pricing: CatalogV2Pricing;
  image: CatalogV2Image;
  isActive: boolean;
  isPublic: boolean;
  isOrderable: boolean;
};

export type CatalogV2OptionGroup = {
  key: string;
  name: string;
  values: string[];
};

export type CatalogV2ParentProduct = {
  id: string;
  productKey: string;
  name: string;
  brand: string | null;
  industry: string;
  industryKey: string;
  subcategory: string | null;
  image: CatalogV2Image;
};

export type CatalogV2ListResponse = {
  products: CatalogV2VariantCard[];
  total: number;
  cardModel: "parent";
};

export type CatalogV2DetailResponse = {
  product: CatalogV2ParentProduct;
  optionGroups: CatalogV2OptionGroup[];
  variants: CatalogV2VariantCard[];
  selectedVariantId: string;
};

export type CatalogV2FilterOption = {
  id: string;
  name: string;
  productCount: number;
};
