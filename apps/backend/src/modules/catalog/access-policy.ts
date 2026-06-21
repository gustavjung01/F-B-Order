import type { RequestIdentity } from "../auth/auth.identity";

export const CURRENCY = "VND" as const;
export type PriceSource = "price_group" | "wholesale" | "base";

export type ProductPricingInput = {
  basePrice: unknown;
  wholesalePrice: unknown;
  priceGroupPrice: unknown;
};

function positiveMoney(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export function selectApprovedCustomerPrice(input: ProductPricingInput) {
  const candidates: Array<[PriceSource, unknown]> = [
    ["price_group", input.priceGroupPrice],
    ["wholesale", input.wholesalePrice],
    ["base", input.basePrice],
  ];

  for (const [source, value] of candidates) {
    const amount = positiveMoney(value);
    if (amount !== null) return { amount, currency: CURRENCY, source };
  }

  return null;
}

export function customerAccessReason(identity: RequestIdentity): string | null {
  if (identity.kind === "anonymous") return "AUTH_REQUIRED";
  if (identity.kind === "unmapped") return "CUSTOMER_PROFILE_REQUIRED";
  if (identity.kind === "staff") return "CUSTOMER_ACCESS_ONLY";
  if (identity.accountStatus !== "active") return "CUSTOMER_INACTIVE";
  if (identity.approvalStatus === "rejected") return "CUSTOMER_REJECTED";
  if (identity.approvalStatus !== "approved") return "CUSTOMER_PENDING";
  return null;
}
