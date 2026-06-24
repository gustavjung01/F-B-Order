import { enrichCatalogV2Variant } from "@/data/catalog-v2/commercial-supplements";
import type {
  CatalogV2DetailResponse,
  CatalogV2ListResponse,
} from "@/data/catalog-v2/product-model";

export class CatalogV2RequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CatalogV2RequestError";
    this.status = status;
    this.code = code;
  }
}

const inFlightRequests = new Map<string, Promise<unknown>>();

async function requestJson<T>(url: string): Promise<T> {
  const existing = inFlightRequests.get(url);
  if (existing) return existing as Promise<T>;

  const request = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new CatalogV2RequestError(
          payload.message || payload.error || `Catalog request failed (${response.status})`,
          response.status,
          payload.error,
        );
      }

      return payload as T;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, request);
  return request;
}

export async function fetchCatalogV2List(url: string) {
  const response = await requestJson<CatalogV2ListResponse>(url);
  return {
    ...response,
    products: response.products.map(enrichCatalogV2Variant),
  };
}

export async function fetchCatalogV2Detail(variantId: string) {
  const response = await requestJson<CatalogV2DetailResponse>(
    `/api/catalog-v2/products/${encodeURIComponent(variantId)}`,
  );
  return {
    ...response,
    variants: response.variants.map(enrichCatalogV2Variant),
  };
}
