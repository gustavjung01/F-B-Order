export type CatalogV2Pricing = {
  visibility: "visible" | "label" | "hidden";
  label: string | null;
  amount: number | null;
  currency: "VND";
  source: "price_group" | "shop" | "retail" | "market" | null;
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
  priceMode: "fixed" | "market";
  price: number | null;
  priceLabel: string | null;
  pricing: CatalogV2Pricing;
  image: CatalogV2Image;
  isActive: boolean;
  isPublic: boolean;
  isOrderable: boolean;
};

export type CatalogV2OptionGroup = {
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
  cardModel: "variant";
};

export type CatalogV2DetailResponse = {
  product: CatalogV2ParentProduct;
  optionGroups: CatalogV2OptionGroup[];
  variants: CatalogV2VariantCard[];
  selectedVariantId: string;
};

export type CatalogV2Tab = {
  id: string;
  name: string;
  productCount: number;
};
