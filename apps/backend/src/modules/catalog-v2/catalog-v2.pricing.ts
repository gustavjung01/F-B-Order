import type { RequestIdentity } from "../auth/auth.identity";

export const CATALOG_V2_CURRENCY = "VND" as const;
export const CATALOG_V2_RETAIL_MARKUP_PERCENT = 15 as const;

export type CatalogV2PriceRow = {
  price_mode: "fixed" | "market";
  price_label: string | null;
  retail_price: string | null;
  shop_price: string | null;
  price_group_price: string | null;
  is_orderable: boolean;
  is_active: boolean;
  is_public: boolean;
  status: string;
};

function positiveMoney(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function isApprovedCustomer(identity: RequestIdentity): boolean {
  return (
    identity.kind === "customer" &&
    identity.approvalStatus === "approved" &&
    identity.accountStatus === "active"
  );
}

function isEstimatedRetailPrice(row: CatalogV2PriceRow): boolean {
  const retailPrice = positiveMoney(row.retail_price);
  const dealerPrice = positiveMoney(row.shop_price);
  if (retailPrice === null || dealerPrice === null) return false;
  return retailPrice === Math.round(dealerPrice * (1 + CATALOG_V2_RETAIL_MARKUP_PERCENT / 100));
}

export function evaluateCatalogV2Pricing(identity: RequestIdentity, row: CatalogV2PriceRow) {
  const baseOrderable =
    row.is_orderable &&
    row.is_active &&
    row.is_public &&
    ["active", "market_price"].includes(row.status);

  if (row.price_mode === "market") {
    return {
      visibility: "label" as const,
      label: row.price_label || "Thời giá",
      amount: null,
      currency: CATALOG_V2_CURRENCY,
      source: "market" as const,
      canOrder: false,
      reason: "MARKET_PRICE",
      estimated: false,
      estimateMarkupPercent: null,
    };
  }

  const approved = isApprovedCustomer(identity);
  const candidates: Array<{
    source: "price_group" | "shop" | "retail";
    value: unknown;
  }> = approved
    ? [
        { source: "price_group", value: row.price_group_price },
        { source: "shop", value: row.shop_price },
        { source: "retail", value: row.retail_price },
      ]
    : [{ source: "retail", value: row.retail_price }];

  for (const candidate of candidates) {
    const amount = positiveMoney(candidate.value);
    if (amount === null) continue;
    const estimated = candidate.source === "retail" && isEstimatedRetailPrice(row);
    return {
      visibility: "visible" as const,
      label: null,
      amount,
      currency: CATALOG_V2_CURRENCY,
      source: candidate.source,
      canOrder: approved && baseOrderable,
      reason: approved ? null : "SHOP_APPROVAL_REQUIRED",
      estimated,
      estimateMarkupPercent: estimated ? CATALOG_V2_RETAIL_MARKUP_PERCENT : null,
    };
  }

  return {
    visibility: "label" as const,
    label: approved ? "Chưa thiết lập giá quán" : "Chưa thiết lập giá lẻ",
    amount: null,
    currency: CATALOG_V2_CURRENCY,
    source: null,
    canOrder: false,
    reason: approved ? "SHOP_PRICE_UNAVAILABLE" : "RETAIL_PRICE_UNAVAILABLE",
    estimated: false,
    estimateMarkupPercent: null,
  };
}
