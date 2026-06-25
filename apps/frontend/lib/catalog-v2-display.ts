import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";

export function formatCatalogV2Money(value: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getCatalogV2PriceLabel(variant: CatalogV2VariantCard) {
  const minPrice = variant.priceMin;
  const maxPrice = variant.priceMax;

  if (minPrice !== null && minPrice !== undefined && maxPrice !== null && maxPrice !== undefined) {
    const minLabel = formatCatalogV2Money(minPrice, variant.pricing.currency);
    if (minPrice === maxPrice) return minLabel;
    return `${minLabel} – ${formatCatalogV2Money(maxPrice, variant.pricing.currency)}`;
  }

  if (variant.price !== null) return formatCatalogV2Money(variant.price, variant.pricing.currency);
  return variant.priceLabel || variant.pricing.label || "Chưa có giá";
}

export function getCatalogV2PriceHeading(variant: CatalogV2VariantCard) {
  if (
    variant.priceMin !== null &&
    variant.priceMin !== undefined &&
    variant.priceMax !== null &&
    variant.priceMax !== undefined &&
    variant.priceMin !== variant.priceMax
  ) {
    return "Khoảng giá đại lý";
  }
  return variant.priceMode === "market" ? "Giá" : "Giá đại lý";
}

export function getCatalogV2PriceNote(variant: CatalogV2VariantCard) {
  void variant;
  return null;
}

export function getCatalogV2OrderLabel(variant: CatalogV2VariantCard) {
  if (variant.priceMode === "market") return "Liên hệ báo giá";
  if (variant.pricing.reason === "DEALER_PRICE_UNAVAILABLE") return "Chưa có giá đại lý";
  if (variant.pricing.reason === "SHOP_APPROVAL_REQUIRED") return "Đăng ký quán để đặt";
  return variant.isOrderable ? "Thêm vào giỏ" : "Chưa thể đặt";
}

export function getCatalogV2VariantCountLabel(variant: CatalogV2VariantCard) {
  const count = Math.max(Number(variant.variantCount) || 1, 1);
  return `${count} phân loại`;
}

export function getCatalogV2OptionSummary(variant: CatalogV2VariantCard) {
  const values = Object.entries(variant.options)
    .filter(([key, value]) => !["package", "sell_unit", "size", "weight", "volume", "capacity"].includes(key) && Boolean(value))
    .map(([, value]) => value);
  return values.length > 0 ? values.join(" · ") : "Chọn trong chi tiết";
}

export function getCatalogV2SpecificationLabel(variant: CatalogV2VariantCard) {
  return variant.specificationLabel || "Quy cách đang được xác minh";
}
