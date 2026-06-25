"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CatalogV2FilterOption,
  CatalogV2ListResponse,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2List } from "@/lib/catalog-v2-client";

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 220;

function normalizeFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isFrozenIndustry(value: string) {
  const normalized = normalizeFilterValue(value);
  return normalized === "dong-lanh" || normalized === "thuc-pham-dong-lanh";
}

function buildProductsUrl(industryKey: string, brands: string[], q: string, offset: number) {
  const params = new URLSearchParams();
  if (industryKey !== "all") params.set("industry", industryKey);
  if (!isFrozenIndustry(industryKey)) {
    for (const brand of brands) params.append("brand", brand);
  }
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return `/api/catalog-v2/products?${params.toString()}`;
}

function normalizeIndustryFacets(options: CatalogV2FilterOption[]) {
  return options.map((option) => ({
    ...option,
    name: isFrozenIndustry(option.id) || isFrozenIndustry(option.name) ? "Đông Lạnh" : option.name,
  }));
}

function equalStringArrays(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function useMultiBrandCatalogBrowser(initialCatalog: CatalogV2ListResponse | null = null) {
  const [products, setProducts] = useState<CatalogV2VariantCard[]>(initialCatalog?.products ?? []);
  const [industries, setIndustries] = useState<CatalogV2FilterOption[]>(normalizeIndustryFacets(initialCatalog?.facets.industries ?? []));
  const [brands, setBrands] = useState<CatalogV2FilterOption[]>(initialCatalog?.facets.brands ?? []);
  const [selectedIndustry, setSelectedIndustryState] = useState("all");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(!initialCatalog);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(Number(initialCatalog?.total) || 0);
  const [hasMore, setHasMore] = useState(Boolean(initialCatalog?.pagination.hasMore));
  const requestVersion = useRef(0);
  const hasUnusedInitialCatalog = useRef(Boolean(initialCatalog));

  const isBrandFilterHidden = isFrozenIndustry(selectedIndustry);
  const selectedBrandsKey = JSON.stringify(selectedBrands);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (hasUnusedInitialCatalog.current && selectedIndustry === "all" && selectedBrands.length === 0 && appliedSearch === "") {
      hasUnusedInitialCatalog.current = false;
      return;
    }

    hasUnusedInitialCatalog.current = false;
    const version = ++requestVersion.current;
    let active = true;

    async function loadFirstPage() {
      try {
        setLoading(true);
        setLoadingMore(false);
        setError("");
        const data = await fetchCatalogV2List(buildProductsUrl(selectedIndustry, selectedBrands, appliedSearch, 0));
        if (!active || version !== requestVersion.current) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setIndustries(normalizeIndustryFacets(data.facets?.industries ?? []));
        setBrands(isBrandFilterHidden ? [] : (data.facets?.brands ?? []));
        setTotal(Number(data.total) || 0);
        setHasMore(Boolean(data.pagination?.hasMore));
      } catch (loadError) {
        if (!active || version !== requestVersion.current) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProducts([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        if (active && version === requestVersion.current) setLoading(false);
      }
    }

    void loadFirstPage();
    return () => {
      active = false;
    };
  }, [appliedSearch, isBrandFilterHidden, selectedBrandsKey, selectedIndustry]);

  useEffect(() => {
    if (selectedIndustry !== "all" && !industries.some((option) => option.id === selectedIndustry)) {
      setSelectedIndustryState("all");
    }
  }, [industries, selectedIndustry]);

  useEffect(() => {
    if (isBrandFilterHidden) {
      if (selectedBrands.length > 0) setSelectedBrands([]);
      return;
    }
    const available = new Set(brands.map((option) => option.id));
    const next = selectedBrands.filter((brand) => available.has(brand));
    if (!equalStringArrays(selectedBrands, next)) setSelectedBrands(next);
  }, [brands, isBrandFilterHidden, selectedBrands]);

  const showMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const version = requestVersion.current;
    try {
      setLoadingMore(true);
      setError("");
      const data = await fetchCatalogV2List(buildProductsUrl(selectedIndustry, selectedBrands, appliedSearch, products.length));
      if (version !== requestVersion.current) return;
      setProducts((current) => {
        const existingIds = new Set(current.map((product) => product.product_id));
        return [...current, ...data.products.filter((product) => !existingIds.has(product.product_id))];
      });
      setIndustries(normalizeIndustryFacets(data.facets?.industries ?? []));
      setBrands(isBrandFilterHidden ? [] : (data.facets?.brands ?? []));
      setTotal(Number(data.total) || 0);
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch (loadError) {
      if (version !== requestVersion.current) return;
      setError(loadError instanceof Error ? loadError.message : "Không tải thêm được sản phẩm");
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }, [appliedSearch, hasMore, isBrandFilterHidden, loading, loadingMore, products.length, selectedBrandsKey, selectedIndustry]);

  function setSelectedIndustry(value: string) {
    setSelectedIndustryState(value);
    if (isFrozenIndustry(value)) setSelectedBrands([]);
  }

  function toggleBrand(value: string) {
    setSelectedBrands((current) => current.includes(value) ? current.filter((brand) => brand !== value) : [...current, value]);
  }

  function clearBrands() {
    setSelectedBrands([]);
  }

  function resetFilters() {
    setSelectedIndustryState("all");
    setSelectedBrands([]);
  }

  return {
    products,
    industries,
    brands,
    selectedIndustry,
    setSelectedIndustry,
    selectedBrands,
    toggleBrand,
    clearBrands,
    resetFilters,
    searchText,
    setSearchText,
    loading,
    loadingMore,
    error,
    total,
    shownCount: products.length,
    hasMore,
    showMore,
    pageSize: PAGE_SIZE,
    isBrandFilterHidden,
  };
}
