"use client";

import { CompactPurchaseSelector } from "@/components/catalog/CompactPurchaseSelector";
import type { CatalogV2DetailResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";

type CatalogVariantSelectorProps = {
  detail: CatalogV2DetailResponse;
  initialVariantId: string;
  onPrimaryVariantChange?: (variant: CatalogV2VariantCard) => void;
};

export function CatalogVariantSelector({
  detail,
  initialVariantId,
  onPrimaryVariantChange,
}: CatalogVariantSelectorProps) {
  return (
    <CompactPurchaseSelector
      detail={detail}
      initialVariantId={initialVariantId}
      onVariantChange={onPrimaryVariantChange}
    />
  );
}
