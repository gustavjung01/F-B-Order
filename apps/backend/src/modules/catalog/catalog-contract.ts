import type { RequestIdentity } from "../auth/auth.identity";
import { evaluatePricingPolicy } from "./access-policy";
import { evaluateCatalogOrderability } from "./orderability-policy";

const UPDATING_LABEL = "Đang cập nhật";

export type CatalogProductRow = {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category_id: string;
  category_name: string;
  subcategory_id: string | null;
  subcategory_name: string | null;
  product_type: "physical" | "bundle" | "service";
  catalog_kind: "sku_candidate" | "bundle_candidate";
  package_size_label: string | null;
  unit_label: string | null;
  base_price: string | null;
  wholesale_price: string | null;
  price_group_price: string | null;
  min_order_qty: string | number;
  image_url: string | null;
  short_description: string | null;
  use_cases: unknown;
  selling_points: unknown;
  data_issues: unknown;
  ordering_enabled: boolean;
  is_active: boolean;
  is_public: boolean;
  bundle_item_count: string;
  invalid_bundle_item_count: string;
};

function publicCategoryName(slug: string, name: string): string {
  return slug === "combo-cong-thuc" ? "Combo gợi ý" : name;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function toCatalogProduct(row: CatalogProductRow, identity: RequestIdentity) {
  const bundleItemCount = Number(row.bundle_item_count || 0);
  const invalidBundleItemCount = Number(row.invalid_bundle_item_count || 0);
  const pricingInput = {
    basePrice: row.base_price,
    wholesalePrice: row.wholesale_price,
    priceGroupPrice: row.price_group_price,
  };
  const orderability = evaluateCatalogOrderability({
    ...pricingInput,
    productType: row.product_type,
    sku: row.sku,
    unitLabel: row.unit_label,
    isPublic: row.is_public,
    isActive: row.is_active,
    orderingEnabled: row.ordering_enabled,
    bundleItemCount,
    invalidBundleItemCount,
    sourceDataIssues: row.data_issues,
  });
  const pricing = evaluatePricingPolicy(identity, pricingInput, orderability.catalogEligible);

  return {
    itemKind: "product" as const,
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    categoryId: row.category_id,
    categoryName: publicCategoryName(row.category_id, row.category_name),
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    productType: row.product_type,
    catalogKind: row.catalog_kind,
    packageSizeLabel: row.package_size_label,
    unitLabel: row.unit_label,
    minOrderQty: positiveInteger(row.min_order_qty, 1),
    imageUrl: row.image_url,
    shortDescription: row.short_description,
    useCases: Array.isArray(row.use_cases) ? row.use_cases : [],
    sellingPoints: Array.isArray(row.selling_points) ? row.selling_points : [],
    isPublic: row.is_public,
    isActive: row.is_active,
    isOrderable: pricing.canOrder,
    catalogEligible: orderability.catalogEligible,
    priceVisibility: pricing.visibility,
    pricing,
    bundleItemCount,
    dataIssues: orderability.dataIssues,
    orderLabel: pricing.canOrder ? "Thêm vào giỏ" : "Chưa đủ điều kiện đặt hàng",
    displayFallbacks: {
      brand: row.brand || UPDATING_LABEL,
      packageSizeLabel: row.package_size_label || UPDATING_LABEL,
      unitLabel: row.unit_label || UPDATING_LABEL,
    },
  };
}

export type CatalogProduct = ReturnType<typeof toCatalogProduct>;
