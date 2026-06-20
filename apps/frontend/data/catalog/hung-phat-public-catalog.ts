import { hungPhatCatalog } from "./hung-phat-catalog";
import type { PublicProduct } from "./product-model";

type RawHungPhatCatalogProduct = (typeof hungPhatCatalog.products)[number];

const UPDATING_LABEL = "Đang cập nhật";

const categoryNameById = new Map<string, string>(
  hungPhatCatalog.categories.map((category) => [category.id, category.name]),
);

const INTERNAL_ONLY_VALUES = new Set([
  "TODO",
  "null",
  "undefined",
  "missing_package_size",
  "missing_unit",
  "missing_price_retail",
  "missing_price_wholesale",
  "missing_image",
  "missing_origin",
  "needs_official_sku",
  "needs_review",
  "public-snippet",
  "inferred-category",
  "todo",
]);

function publicText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return UPDATING_LABEL;

  const text = String(value).trim();
  if (!text) return UPDATING_LABEL;

  const upperText = text.toUpperCase();
  if (INTERNAL_ONLY_VALUES.has(text) || INTERNAL_ONLY_VALUES.has(upperText)) {
    return UPDATING_LABEL;
  }

  if (/\bTODO\b/i.test(text)) return UPDATING_LABEL;
  if (/missing_/i.test(text)) return UPDATING_LABEL;
  if (/needs_/i.test(text)) return UPDATING_LABEL;
  if (/public-snippet|inferred-category/i.test(text)) return UPDATING_LABEL;

  return text;
}

function publicList(values: readonly string[]): string[] {
  return values
    .map((value) => publicText(value))
    .filter((value) => value !== UPDATING_LABEL);
}

function publicImageUrl(values: readonly string[]): string | null {
  return values.length > 0 ? values[0] ?? null : null;
}

function publicCategoryName(id: string | null | undefined): string {
  if (!id) return UPDATING_LABEL;
  return categoryNameById.get(id) ?? UPDATING_LABEL;
}

function publicPrice(product: RawHungPhatCatalogProduct): string {
  if (typeof product.priceRetail === "number" && product.priceRetail > 0) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: product.currency,
      maximumFractionDigits: 0,
    }).format(product.priceRetail);
  }

  return UPDATING_LABEL;
}

function publicDescription(product: RawHungPhatCatalogProduct): string | null {
  const description = publicText(product.shortDescription ?? product.description);
  if (description !== UPDATING_LABEL) return description;

  const useCases = publicList(product.useCases);
  if (useCases.length > 0) {
    return `Phù hợp cho ${useCases.join(", ")}.`;
  }

  return null;
}

export function toHungPhatPublicProduct(product: RawHungPhatCatalogProduct): PublicProduct {
  const imageUrls = product.imageUrls as readonly string[];
  const imageUrl = publicImageUrl(imageUrls);

  return {
    id: product.id,
    slug: product.slug,
    name: publicText(product.name),
    brand: publicText(product.brand),
    categoryId: product.categoryId,
    categoryName: publicCategoryName(product.categoryId),
    subcategoryId: product.subcategoryId,
    subcategoryName: product.subcategoryId ? publicCategoryName(product.subcategoryId) : null,
    productType: product.productType,
    catalogKind: product.catalogKind,
    packageSizeLabel: publicText(product.packageSize),
    unitLabel: publicText(product.unit),
    priceLabel: publicPrice(product),
    imageUrl,
    shortDescription: publicDescription(product),
    useCases: publicList(product.useCases),
    sellingPoints: publicList(product.sellingPoints),
    isOrderable: product.isOrderable,
    orderLabel: product.isOrderable ? "Thêm vào giỏ" : "Liên hệ cập nhật giá",
  };
}

export const hungPhatPublicProducts = hungPhatCatalog.products
  .filter((product) => product.catalogKind === "sku_candidate" || product.catalogKind === "content" || product.catalogKind === "bundle_candidate")
  .map(toHungPhatPublicProduct);

export const hungPhatPublicCategories = hungPhatCatalog.categories;
export const hungPhatPublicMerchant = hungPhatCatalog.merchant;
export const HUNG_PHAT_UPDATING_LABEL = UPDATING_LABEL;
