import { selectApprovedCustomerPrice, type ProductPricingInput } from "./access-policy";

export type CatalogOrderabilityInput = ProductPricingInput & {
  productType: "physical" | "bundle" | "service";
  sku: string | null;
  unitLabel: string | null;
  isPublic: boolean;
  isActive: boolean;
  orderingEnabled: boolean;
  bundleItemCount: number;
  invalidBundleItemCount: number;
  sourceDataIssues: unknown;
};

export type CatalogOrderability = {
  catalogEligible: boolean;
  dataIssues: string[];
};

function normalizedIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
}

export function evaluateCatalogOrderability(input: CatalogOrderabilityInput): CatalogOrderability {
  const issues = new Set(normalizedIssues(input.sourceDataIssues));
  const hasPrice = selectApprovedCustomerPrice(input) !== null;

  if (!input.isPublic) issues.add("not_public");
  if (!input.isActive) issues.add("inactive");
  if (!input.orderingEnabled) issues.add("ordering_disabled");
  if (!input.sku?.trim()) issues.add("missing_sku");
  if (!input.unitLabel?.trim()) issues.add("missing_unit");
  if (!hasPrice) issues.add("missing_price");

  if (input.productType === "bundle") {
    if (input.bundleItemCount < 1) issues.add("missing_bundle_components");
    if (input.invalidBundleItemCount > 0) issues.add("invalid_bundle_components");
  }

  const blockingIssues = new Set([
    "not_public",
    "inactive",
    "ordering_disabled",
    "missing_sku",
    "missing_unit",
    "missing_price",
    "missing_bundle_components",
    "invalid_bundle_components",
  ]);

  return {
    catalogEligible: ![...issues].some((issue) => blockingIssues.has(issue)),
    dataIssues: [...issues].sort(),
  };
}
