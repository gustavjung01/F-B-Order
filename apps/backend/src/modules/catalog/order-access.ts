import type { RequestIdentity } from "../auth/auth.identity";
import {
  CURRENCY,
  customerAccessReason,
  selectApprovedCustomerPrice,
  type PriceSource,
  type ProductPricingInput,
} from "./access-policy";

export type ProductOrderabilityInput = ProductPricingInput & {
  sku: string | null;
  unitLabel: string | null;
  productType: "physical" | "bundle" | "service";
  isOrderable: boolean;
  isActive: boolean;
  isPublic: boolean;
  bundleItemCount: number;
};

export type OrderAccessDecision =
  | {
      allowed: true;
      unitPrice: number;
      currency: typeof CURRENCY;
      priceSource: PriceSource;
    }
  | { allowed: false; code: string };

export function validateOrderProductAccess(
  identity: RequestIdentity,
  product: ProductOrderabilityInput,
): OrderAccessDecision {
  const reason = customerAccessReason(identity);
  if (reason) return { allowed: false, code: reason };
  if (!product.isPublic) return { allowed: false, code: "PRODUCT_NOT_PUBLIC" };
  if (!product.isActive) return { allowed: false, code: "PRODUCT_INACTIVE" };
  if (!product.isOrderable) return { allowed: false, code: "PRODUCT_NOT_ORDERABLE" };
  if (!product.sku || !product.unitLabel) {
    return { allowed: false, code: "PRODUCT_DATA_INCOMPLETE" };
  }
  if (product.productType === "bundle" && product.bundleItemCount < 1) {
    return { allowed: false, code: "BUNDLE_COMPONENTS_REQUIRED" };
  }

  const price = selectApprovedCustomerPrice(product);
  if (!price) return { allowed: false, code: "PRICE_UNAVAILABLE" };

  return {
    allowed: true,
    unitPrice: price.amount,
    currency: price.currency,
    priceSource: price.source,
  };
}
