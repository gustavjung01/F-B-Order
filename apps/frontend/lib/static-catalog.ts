import { hungPhatCatalog } from "@/data/catalog/hung-phat-catalog";
import type { CategoryWithCount, PublicProduct } from "@/data/catalog/product-model";

const rootCategories = [
  { id: "tra-sua-pha-che", name: "Trà sữa & pha chế", sortOrder: 1 },
  { id: "mi-cay-han-quoc", name: "Mì cay Hàn Quốc", sortOrder: 2 },
  { id: "thuc-pham-dong-lanh", name: "Thực phẩm đông lạnh", sortOrder: 3 },
  { id: "combo-cong-thuc", name: "Combo gợi ý", sortOrder: 4 },
] as const;

function isCatalogItem(product: (typeof hungPhatCatalog.products)[number]): boolean {
  return (
    product.catalogKind === "sku_candidate"
    || product.catalogKind === "bundle_candidate"
    || product.productType === "recipe_content"
  );
}

function categoryName(categoryId: string): string {
  return rootCategories.find((category) => category.id === categoryId)?.name || categoryId;
}

function toStaticProduct(product: (typeof hungPhatCatalog.products)[number]): PublicProduct {
  const isBundle = product.productType === "bundle" || product.productType === "recipe_content";
  return {
    itemKind: "product",
    id: product.id,
    slug: product.slug,
    sku: null,
    name: product.name,
    brand: product.brand,
    categoryId: product.categoryId,
    categoryName: categoryName(product.categoryId),
    subcategoryId: product.subcategoryId,
    subcategoryName: product.subcategoryId,
    productType: isBundle ? "bundle" : product.productType === "service" ? "service" : "physical",
    catalogKind: isBundle ? "bundle_candidate" : "sku_candidate",
    packageSizeLabel: product.packageSize,
    unitLabel: product.unit,
    minOrderQty: Math.max(1, product.minOrderQty || 1),
    imageUrl: product.imageUrls[0] || null,
    shortDescription: product.shortDescription,
    useCases: [...product.useCases],
    sellingPoints: [...product.sellingPoints],
    isPublic: true,
    isActive: product.status === "active" || product.status === "needs_review",
    isOrderable: false,
    catalogEligible: false,
    priceVisibility: "hidden",
    pricing: {
      visibility: "hidden",
      reason: "STATIC_MODE",
      canOrder: false,
    },
    bundleItemCount: 0,
    dataIssues: [...product.dataIssues, "static_mode_order_disabled"],
    orderLabel: "Chế độ catalog tĩnh",
    displayFallbacks: {
      brand: product.brand || "Đang cập nhật",
      packageSizeLabel: product.packageSize || "Đang cập nhật",
      unitLabel: product.unit || "Đang cập nhật",
    },
  };
}

const staticProducts = hungPhatCatalog.products.filter(isCatalogItem).map(toStaticProduct);

export function getStaticCategories(): CategoryWithCount[] {
  return rootCategories.map((category) => {
    const productCount = staticProducts.filter((product) => product.categoryId === category.id).length;
    return {
      ...category,
      parentId: null,
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
} = {}) {
  const search = input.search?.trim().toLocaleLowerCase("vi") || "";
  const filtered = staticProducts.filter((product) => {
    if (input.categoryId && input.categoryId !== "all" && product.categoryId !== input.categoryId) {
      return false;
    }
    if (!search) return true;
    return [product.name, product.brand || "", product.shortDescription || ""]
      .join(" ")
      .toLocaleLowerCase("vi")
      .includes(search);
  });
  return filtered.slice(0, Math.min(Math.max(input.limit || 80, 1), 100));
}

export function getStaticProduct(slug: string): PublicProduct | null {
  return staticProducts.find((product) => product.slug === slug) || null;
}
