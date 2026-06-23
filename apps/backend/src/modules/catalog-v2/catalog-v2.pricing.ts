import type { RequestIdentity } from "../auth/auth.identity";

export const CATALOG_V2_CURRENCY = "VND" as const;

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
    return {
      visibility: "visible" as const,
      label: null,
      amount,
      currency: CATALOG_V2_CURRENCY,
      source: candidate.source,
      canOrder: approved && baseOrderable,
      reason: approved ? null : "SHOP_APPROVAL_REQUIRED",
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
  };
}
