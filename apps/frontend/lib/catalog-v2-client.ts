import { enrichCatalogV2Variant } from "@/data/catalog-v2/commercial-supplements";
import type {
  CatalogV2DetailResponse,
  CatalogV2ListResponse,
  CatalogV2OptionGroup,
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

function normalizedOptionGroupKey(value: string) {
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if ([
    "size",
    "kich_thuoc",
    "dung_tich",
    "khoi_luong",
    "trong_luong",
    "volume",
    "weight",
    "capacity",
  ].includes(key)) {
    return "size";
  }

  return key;
}

export function normalizeCatalogV2OptionGroups(groups: CatalogV2OptionGroup[]) {
  const merged = new Map<string, CatalogV2OptionGroup>();

  for (const group of groups) {
    const key = normalizedOptionGroupKey(group.key || group.name);
    const current = merged.get(key);
    const values = current ? [...current.values] : [];

    for (const value of group.values) {
      if (!values.includes(value)) values.push(value);
    }

    merged.set(key, {
      key,
      name: key === "size" ? "Dung tích / khối lượng" : group.name,
      values,
    });
  }

  return [...merged.values()];
}

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
    optionGroups: normalizeCatalogV2OptionGroups(response.optionGroups),
    variants: response.variants.map(enrichCatalogV2Variant),
  };
}
