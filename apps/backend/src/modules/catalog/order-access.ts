import type { RequestIdentity } from "../auth/auth.identity";
import {
  CURRENCY,
  customerAccessReason,
  selectApprovedCustomerPrice,
  type PriceSource,
  type ProductPricingInput,
} from "./access-policy";
import { evaluateCatalogOrderability } from "./orderability-policy";

export type ProductOrderabilityInput = ProductPricingInput & {
  sku: string | null;
  unitLabel: string | null;
  productType: "physical" | "bundle" | "service";
  isOrderable: boolean;
  isActive: boolean;
  isPublic: boolean;
  bundleItemCount: number;
  invalidBundleItemCount?: number;
  sourceDataIssues?: unknown;
};

export type OrderAccessDecision =
  | {
      allowed: true;
      unitPrice: number;
      currency: typeof CURRENCY;
      priceSource: PriceSource;
    }
  | { allowed: false; code: string; dataIssues?: string[] };

export function validateOrderProductAccess(
  identity: RequestIdentity,
  product: ProductOrderabilityInput,
): OrderAccessDecision {
  const reason = customerAccessReason(identity);
  if (reason) return { allowed: false, code: reason };

  const orderability = evaluateCatalogOrderability({
    ...product,
    orderingEnabled: product.isOrderable,
    invalidBundleItemCount: product.invalidBundleItemCount ?? 0,
    sourceDataIssues: product.sourceDataIssues ?? [],
  });

  if (!orderability.catalogEligible) {
    let code = "PRODUCT_NOT_ORDERABLE";
    if (orderability.dataIssues.includes("missing_bundle_components")) {
      code = "BUNDLE_COMPONENTS_REQUIRED";
    } else if (orderability.dataIssues.includes("invalid_bundle_components")) {
      code = "BUNDLE_COMPONENTS_INVALID";
    } else if (orderability.dataIssues.includes("not_public")) {
      code = "PRODUCT_NOT_PUBLIC";
    } else if (orderability.dataIssues.includes("inactive")) {
      code = "PRODUCT_INACTIVE";
    } else if (
      orderability.dataIssues.includes("missing_sku") ||
      orderability.dataIssues.includes("missing_unit")
    ) {
      code = "PRODUCT_DATA_INCOMPLETE";
    } else if (orderability.dataIssues.includes("missing_price")) {
      code = "PRICE_UNAVAILABLE";
    }

    return { allowed: false, code, dataIssues: orderability.dataIssues };
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
