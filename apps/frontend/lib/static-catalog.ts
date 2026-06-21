import {
  hungPhatPublicCategories,
  hungPhatPublicProducts,
} from "@/data/catalog/hung-phat-public-catalog";
import type { CategoryWithCount, PublicProduct } from "@/data/catalog/product-model";

const rootCategoryIds = [
  "tra-sua-pha-che",
  "mi-cay-han-quoc",
  "thuc-pham-dong-lanh",
  "combo-cong-thuc",
] as const;

const staticProducts: PublicProduct[] = hungPhatPublicProducts.map((product) => ({
  ...product,
  isOrderable: false,
  catalogEligible: false,
  priceVisibility: "hidden",
  pricing: {
    visibility: "hidden",
    reason: "STATIC_MODE",
    canOrder: false,
  },
  dataIssues: [...product.dataIssues, "static_mode_order_disabled"],
  orderLabel: "Chế độ catalog tĩnh",
}));

export function getStaticCategories(): CategoryWithCount[] {
  return rootCategoryIds.map((categoryId, index) => {
    const source = hungPhatPublicCategories.find((category) => category.id === categoryId);
    const productCount = staticProducts.filter((product) => product.categoryId === categoryId).length;
    return {
      id: categoryId,
      name: source?.name || categoryId,
      parentId: null,
      sortOrder: source?.sortOrder ?? index + 1,
      productCount,
      isActive: true,
      hasProducts: productCount > 0,
    };
  });
}

export function getStaticProducts(input: {
  categoryId?: string | null;
  search?: string | null;
  limit?: number;
} = {}): PublicProduct[] {
  const search = input.search?.trim().toLocaleLowerCase("vi") || "";
  const filtered = staticProducts.filter((product) => {
    if (input.categoryId && input.categoryId !== "all" && product.categoryId !== input.categoryId) {
      return false;
    }
    if (!search) return true;
    return [product.name, product.brand, product.shortDescription || ""]
      .join(" ")
      .toLocaleLowerCase("vi")
      .includes(search);
  });
  return filtered.slice(0, Math.min(Math.max(input.limit || 80, 1), 100));
}

export function getStaticProduct(slug: string): PublicProduct | null {
  return staticProducts.find((product) => product.slug === slug) || null;
}
