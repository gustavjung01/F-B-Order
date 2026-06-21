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
  const blockingIssues = new Set<string>();
  const managedIssues = [
    "not_public",
    "inactive",
    "ordering_disabled",
    "missing_sku",
    "missing_unit",
    "missing_price",
    "missing_bundle_components",
    "invalid_bundle_components",
  ];
  managedIssues.forEach((issue) => issues.delete(issue));

  const addBlockingIssue = (issue: string) => {
    issues.add(issue);
    blockingIssues.add(issue);
  };
  const hasPrice = selectApprovedCustomerPrice(input) !== null;

  if (!input.isPublic) addBlockingIssue("not_public");
  if (!input.isActive) addBlockingIssue("inactive");
  if (!input.orderingEnabled) addBlockingIssue("ordering_disabled");
  if (!input.sku?.trim()) addBlockingIssue("missing_sku");
  if (!input.unitLabel?.trim()) addBlockingIssue("missing_unit");
  if (!hasPrice) addBlockingIssue("missing_price");

  if (input.productType === "bundle") {
    if (input.bundleItemCount < 1) addBlockingIssue("missing_bundle_components");
    if (input.invalidBundleItemCount > 0) addBlockingIssue("invalid_bundle_components");
  }

  return {
    catalogEligible: blockingIssues.size === 0,
    dataIssues: [...issues].sort(),
  };
}
