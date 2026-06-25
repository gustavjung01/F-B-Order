import "server-only";

import { auth } from "@clerk/nextjs/server";
import { enrichCatalogV2Variant } from "@/data/catalog-v2/commercial-supplements";
import type { CatalogV2ListResponse } from "@/data/catalog-v2/product-model";
import { getBackendApiUrl } from "@/lib/backend-api";

const INITIAL_CATALOG_PAGE_SIZE = 40;

export async function fetchInitialCatalogV2(): Promise<CatalogV2ListResponse> {
  const { getToken } = await auth();
  const token = await getToken();
  const url = new URL(getBackendApiUrl("/catalog/products"));
  url.searchParams.set("limit", String(INITIAL_CATALOG_PAGE_SIZE));
  url.searchParams.set("offset", "0");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<CatalogV2ListResponse> & {
    error?: string;
    message?: string;
  };

  if (!response.ok || !Array.isArray(payload.products)) {
    throw new Error(payload.message || payload.error || `Catalog request failed (${response.status})`);
  }

  return {
    products: payload.products.map(enrichCatalogV2Variant),
    total: Number(payload.total) || 0,
    cardModel: "parent",
    pagination: {
      limit: Number(payload.pagination?.limit) || INITIAL_CATALOG_PAGE_SIZE,
      offset: Number(payload.pagination?.offset) || 0,
      hasMore: Boolean(payload.pagination?.hasMore),
    },
    facets: {
      industries: payload.facets?.industries ?? [],
      brands: payload.facets?.brands ?? [],
    },
  };
}
