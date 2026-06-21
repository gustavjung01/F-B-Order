import type { PublicProduct } from "@/data/catalog/product-model";

const hiddenPriceMessages: Record<string, string> = {
  AUTH_REQUIRED: "Đăng nhập để xem giá",
  CUSTOMER_PROFILE_REQUIRED: "Tạo hồ sơ quán để xem giá",
  CUSTOMER_PENDING: "Hồ sơ đang chờ duyệt",
  CUSTOMER_REJECTED: "Hồ sơ chưa được duyệt",
  CUSTOMER_BLOCKED: "Tài khoản đang bị khóa",
  CUSTOMER_INACTIVE: "Tài khoản chưa hoạt động",
  CUSTOMER_ACCESS_ONLY: "Chỉ tài khoản khách hàng được xem giá",
  PRICE_UNAVAILABLE: "Giá đang cập nhật",
  STATIC_MODE: "Giá chưa mở trong chế độ tĩnh",
};

export function getProductPriceAmount(product: PublicProduct): number | null {
  return product.pricing.visibility === "visible" ? product.pricing.amount : null;
}

export function getProductPriceLabel(product: PublicProduct): string {
  if (product.pricing.visibility === "visible") {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: product.pricing.currency,
      maximumFractionDigits: 0,
    }).format(product.pricing.amount);
  }
  return hiddenPriceMessages[product.pricing.reason] || "Giá chưa khả dụng";
}

export function getProductOrderMessage(product: PublicProduct): string {
  if (product.isOrderable) return product.orderLabel || "Thêm vào giỏ";
  if (product.pricing.visibility === "hidden") {
    return hiddenPriceMessages[product.pricing.reason] || product.orderLabel;
  }
  if (!product.catalogEligible) return "Sản phẩm chưa đủ dữ liệu đặt hàng";
  return product.orderLabel || "Chưa thể đặt hàng";
}

export function getProductDisplayBrand(product: PublicProduct): string {
  return product.brand || product.displayFallbacks.brand;
}

export function getProductDisplayPackage(product: PublicProduct): string {
  return product.packageSizeLabel || product.displayFallbacks.packageSizeLabel;
}

export function getProductDisplayUnit(product: PublicProduct): string {
  return product.unitLabel || product.displayFallbacks.unitLabel;
}
