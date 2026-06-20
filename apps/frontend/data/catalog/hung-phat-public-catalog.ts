import { hungPhatCatalog, type HungPhatCatalogProduct } from "./hung-phat-catalog";

const UPDATING_LABEL = "Đang cập nhật";

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

export type HungPhatPublicProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: string;
  subcategoryId: string | null;
  productType: HungPhatCatalogProduct["productType"];
  catalogKind: HungPhatCatalogProduct["catalogKind"];
  packageSizeLabel: string;
  unitLabel: string;
  priceLabel: string;
  imageUrl: string | null;
  shortDescription: string | null;
  isOrderable: boolean;
  orderLabel: string;
};

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

function publicPrice(product: HungPhatCatalogProduct): string {
  if (typeof product.priceRetail === "number" && product.priceRetail > 0) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: product.currency,
      maximumFractionDigits: 0,
    }).format(product.priceRetail);
  }

  return UPDATING_LABEL;
}

function publicDescription(product: HungPhatCatalogProduct): string | null {
  const description = publicText(product.shortDescription ?? product.description);
  if (description !== UPDATING_LABEL) return description;

  if (product.useCases.length > 0) {
    return `Phù hợp cho ${product.useCases.join(", ")}.`;
  }

  return null;
}

export function toHungPhatPublicProduct(product: HungPhatCatalogProduct): HungPhatPublicProduct {
  const imageUrl = product.imageUrls[0] ?? null;

  return {
    id: product.id,
    slug: product.slug,
    name: publicText(product.name),
    brand: publicText(product.brand),
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    productType: product.productType,
    catalogKind: product.catalogKind,
    packageSizeLabel: publicText(product.packageSize),
    unitLabel: publicText(product.unit),
    priceLabel: publicPrice(product),
    imageUrl,
    shortDescription: publicDescription(product),
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
