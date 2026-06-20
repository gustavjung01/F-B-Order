import {
  hungPhatPublicCategories,
  hungPhatPublicMerchant,
  hungPhatPublicProducts,
} from "./hung-phat-public-catalog";
import type { CategoryWithCount, PublicProduct } from "./product-model";

type ProductQuery = {
  categoryId?: string | null;
  subcategoryId?: string | null;
  q?: string | null;
  productType?: string | null;
  catalogKind?: string | null;
  limit?: number | null;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSearch(product: PublicProduct, q: string): boolean {
  const needle = normalizeSearchText(q);
  if (!needle) return true;

  const haystack = normalizeSearchText([
    product.name,
    product.brand,
    product.packageSizeLabel,
    product.unitLabel,
    product.shortDescription ?? "",
    ...product.useCases,
    ...product.sellingPoints,
  ].join(" "));

  return haystack.includes(needle);
}

function normalizeLimit(limit: number | null | undefined): number | null {
  if (!limit || Number.isNaN(limit)) return null;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

export function getCatalogMerchant() {
  return hungPhatPublicMerchant;
}

export function listCatalogProducts(query: ProductQuery = {}) {
  const limit = normalizeLimit(query.limit);

  let products = hungPhatPublicProducts.filter((product) => {
    if (query.categoryId && product.categoryId !== query.categoryId) return false;
    if (query.subcategoryId && product.subcategoryId !== query.subcategoryId) return false;
    if (query.productType && product.productType !== query.productType) return false;
    if (query.catalogKind && product.catalogKind !== query.catalogKind) return false;
    if (query.q && !matchesSearch(product, query.q)) return false;
    return true;
  });

  const total = products.length;
  if (limit !== null) products = products.slice(0, limit);

  return {
    products,
    total,
  };
}

export function getCatalogProductBySlug(slug: string) {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;

  return hungPhatPublicProducts.find((product) => product.slug === normalizedSlug) ?? null;
}

export function getCatalogProductById(id: string) {
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  return hungPhatPublicProducts.find((product) => product.id === normalizedId) ?? null;
}

export function listCatalogCategories(): CategoryWithCount[] {
  return hungPhatPublicCategories.map((category) => {
    const productCount = hungPhatPublicProducts.filter((product) => {
      return product.categoryId === category.id || product.subcategoryId === category.id;
    }).length;

    return {
      ...category,
      productCount,
    };
  });
}
