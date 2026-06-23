import type { CatalogV2VariantCard } from "@/data/catalog-v2/product-model";

export function formatCatalogV2Money(value: number, currency = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function getCatalogV2PriceLabel(variant: CatalogV2VariantCard) {
  if (variant.price !== null) return formatCatalogV2Money(variant.price, variant.pricing.currency);
  return variant.priceLabel || variant.pricing.label || "Chưa có giá";
}

export function getCatalogV2OrderLabel(variant: CatalogV2VariantCard) {
  if (variant.priceMode === "market") return "Liên hệ báo giá";
  if (variant.pricing.reason === "RETAIL_PRICE_UNAVAILABLE") return "Chưa có giá lẻ";
  if (variant.pricing.reason === "SHOP_PRICE_UNAVAILABLE") return "Chưa có giá quán";
  if (variant.pricing.reason === "SHOP_APPROVAL_REQUIRED") return "Đăng ký quán để đặt";
  return variant.isOrderable ? "Thêm vào giỏ" : "Chưa thể đặt";
}

export function getCatalogV2OptionSummary(variant: CatalogV2VariantCard) {
  const values = Object.values(variant.options).filter(Boolean);
  return values.length > 0 ? values.join(" · ") : variant.sku;
}
