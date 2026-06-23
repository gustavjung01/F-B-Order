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

export function getCatalogV2PriceHeading(variant: CatalogV2VariantCard) {
  if (variant.pricing.estimated) return "Giá lẻ dự kiến";
  if (variant.pricing.source === "price_group") return "Giá theo nhóm quán";
  if (variant.pricing.source === "shop") return "Giá đại lý";
  if (variant.priceMode === "market") return "Giá";
  return "Giá bán";
}

export function getCatalogV2PriceNote(variant: CatalogV2VariantCard) {
  if (variant.pricing.estimated && variant.pricing.estimateMarkupPercent !== null) {
    return `Tạm tính bằng giá đại lý + ${variant.pricing.estimateMarkupPercent}%`;
  }
  if (variant.pricing.reason === "SHOP_APPROVAL_REQUIRED") {
    return "Duyệt hồ sơ quán để mở giá đại lý và đặt hàng";
  }
  return null;
}

export function getCatalogV2OrderLabel(variant: CatalogV2VariantCard) {
  if (variant.priceMode === "market") return "Liên hệ báo giá";
  if (variant.pricing.reason === "RETAIL_PRICE_UNAVAILABLE") return "Chưa có giá lẻ";
  if (variant.pricing.reason === "SHOP_PRICE_UNAVAILABLE") return "Chưa có giá quán";
  if (variant.pricing.reason === "SHOP_APPROVAL_REQUIRED") return "Đăng ký quán để đặt";
  return variant.isOrderable ? "Thêm vào giỏ" : "Chưa thể đặt";
}

export function getCatalogV2OptionSummary(variant: CatalogV2VariantCard) {
  const values = Object.entries(variant.options)
    .filter(([key, value]) => !["package", "sell_unit"].includes(key) && Boolean(value))
    .map(([, value]) => value);
  return values.length > 0 ? values.join(" · ") : "Mặc định";
}

export function getCatalogV2SpecificationLabel(variant: CatalogV2VariantCard) {
  return variant.specificationLabel || "Đang cập nhật";
}
