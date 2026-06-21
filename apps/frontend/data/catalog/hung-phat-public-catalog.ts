import { hungPhatCatalog } from "./hung-phat-catalog";
import type { PublicProduct } from "./product-model";

type RawHungPhatCatalogProduct = (typeof hungPhatCatalog.products)[number];

const UPDATING_LABEL = "Đang cập nhật";
const HUNG_PHAT_ASSET_BASE_URL = "https://cdn.bepsi.click";
const PUBLIC_CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  "combo-cong-thuc": "Combo gợi ý",
};

const imageUrlByProductId: Record<string, string> = {
  "tra-ona": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tra-ona.jpg`,
  "tra-loc-phat": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tra-loc-phat.jpg`,
  "tra-pha-may-2025": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tra-pha-may-2025.jpg`,
  "tra-oolong-sen": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tra-oolong-sen.jpg`,
  "bot-sua-sawasdee-1kg": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/bot-sua-sawasdee-1kg.jpg`,
  "bot-sua-sumi": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/bot-sua-sumi.jpg`,
  "bot-magisea-25kg": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/bot-magisea-25kg.jpg`,
  "tran-chau-5s-dai-loan": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tran-chau-5s-dai-loan.jpg`,
  "tran-chau-olong": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tran-chau-olong.jpg`,
  "tran-chau-3q-sumi": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/tran-chau-3q-sumi.jpg`,
  "bot-pudding-sumi": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/bot-pudding-sumi.jpg`,
  "syrup-prince": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/syrup-prince.jpg`,
  "dao-ngam-duong-prince": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/dao-ngam-duong-prince.jpg`,
  "nuoc-cot-dua-sumi": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/nuoc-cot-dua-sumi.jpg`,
  "barismate-nguyen-lieu-da-xay": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/barismate-nguyen-lieu-da-xay.jpg`,
  "barismate-nguyen-lieu-tra-sua": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/products/barismate-nguyen-lieu-tra-sua.jpg`,
  "mi-cay-han-quoc-base": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-mi-cay-han-quoc-base.jpg`,
  "sot-gia-vi-mi-cay": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-sot-gia-vi-mi-cay.jpg`,
  "topping-mi-cay": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-topping-mi-cay.jpg`,
  "thuc-pham-dong-lanh-general": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-thuc-pham-dong-lanh.jpg`,
  "xien-que-an-vat": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-xien-que-an-vat.jpg`,
  "vien-tha-lau-dong-lanh": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-vien-tha-lau-dong-lanh.jpg`,
  "do-chien-dong-lanh": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/categories/cover-do-chien-dong-lanh.jpg`,
  "combo-12-cong-thuc-tra-trai-cay-loc-phat": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/recipes/cover-combo-12-cong-thuc-tra-trai-cay-loc-phat.jpg`,
  "combo-15-cong-thuc-tra-trai-cay": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/recipes/cover-combo-15-cong-thuc-tra-trai-cay.jpg`,
  "combo-10-cong-thuc-tra-sua-chuan-gu": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/recipes/cover-combo-10-cong-thuc-tra-sua-chuan-gu.jpg`,
  "combo-10-cong-thuc-de-pha-de-ban-loc-phat": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/recipes/cover-combo-10-cong-thuc-de-pha-de-ban-loc-phat.jpg`,
  "combo-5-cong-thuc-uong-nong-noel": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/recipes/cover-combo-5-cong-thuc-uong-nong-noel.jpg`,
  "solution-tra-pha-may-2025": `${HUNG_PHAT_ASSET_BASE_URL}/catalog/hung-phat/covers/recipes/cover-solution-tra-pha-may-2025.jpg`,
};

const categoryNameById = new Map<string, string>(
  hungPhatCatalog.categories.map((category) => [
    category.id,
    PUBLIC_CATEGORY_NAME_OVERRIDES[category.id] ?? category.name,
  ]),
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

function publicImageUrl(product: RawHungPhatCatalogProduct): string | null {
  const mappedImageUrl = imageUrlByProductId[product.id];
  if (mappedImageUrl) return mappedImageUrl;

  const imageUrls = product.imageUrls as readonly string[];
  return imageUrls.length > 0 ? imageUrls[0] ?? null : null;
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
  const imageUrl = publicImageUrl(product);

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
  .filter((product) => product.catalogKind === "sku_candidate" || product.catalogKind === "bundle_candidate")
  .map(toHungPhatPublicProduct);

export const hungPhatPublicCategories = hungPhatCatalog.categories.map((category) => ({
  ...category,
  name: PUBLIC_CATEGORY_NAME_OVERRIDES[category.id] ?? category.name,
}));
export const hungPhatPublicMerchant = hungPhatCatalog.merchant;
export const HUNG_PHAT_UPDATING_LABEL = UPDATING_LABEL;
