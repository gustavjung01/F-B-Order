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

function buildProductsUrl(
  industryKey: string,
  brand: string,
  q: string,
  offset: number,
) {
  const params = new URLSearchParams();
  if (industryKey !== "all") params.set("industry", industryKey);
  if (brand !== "all" && !isFrozenIndustry(industryKey)) params.set("brand", brand);
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return `/api/catalog-v2/products?${params.toString()}`;
}

function normalizeIndustryFacets(options: CatalogV2FilterOption[]) {
  return options.map((option) => ({
    ...option,
    name: isFrozenIndustry(option.id) || isFrozenIndustry(option.name)
      ? "Đông Lạnh"
      : option.name,
  }));
}

export function useCatalogBrowser(initialCatalog: CatalogV2ListResponse | null = null) {
  const [products, setProducts] = useState<CatalogV2VariantCard[]>(initialCatalog?.products ?? []);
  const [industries, setIndustries] = useState<CatalogV2FilterOption[]>(
    normalizeIndustryFacets(initialCatalog?.facets.industries ?? []),
  );
  const [brands, setBrands] = useState<CatalogV2FilterOption[]>(initialCatalog?.facets.brands ?? []);
  const [selectedIndustry, setSelectedIndustryState] = useState("all");
  const [selectedBrand, setSelectedBrandState] = useState("all");
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(searchText.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (
      hasUnusedInitialCatalog.current
      && selectedIndustry === "all"
      && selectedBrand === "all"
      && appliedSearch === ""
    ) {
      hasUnusedInitialCatalog.current = false;
      return;
    }

    hasUnusedInitialCatalog.current = false;
    const version = ++requestVersion.current;
    let activeRequest = true;

    async function loadFirstPage() {
      try {
        setLoading(true);
        setLoadingMore(false);
        setError("");

        const data = await fetchCatalogV2List(
          buildProductsUrl(selectedIndustry, selectedBrand, appliedSearch, 0),
        );
        if (!activeRequest || version !== requestVersion.current) return;

        setProducts(Array.isArray(data.products) ? data.products : []);
        setIndustries(normalizeIndustryFacets(data.facets?.industries ?? []));
        setBrands(isBrandFilterHidden ? [] : (data.facets?.brands ?? []));
        setTotal(Number(data.total) || 0);
        setHasMore(Boolean(data.pagination?.hasMore));
      } catch (loadError) {
        if (!activeRequest || version !== requestVersion.current) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProducts([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        if (activeRequest && version === requestVersion.current) setLoading(false);
      }
    }

    void loadFirstPage();
    return () => {
      activeRequest = false;
    };
  }, [appliedSearch, isBrandFilterHidden, selectedBrand, selectedIndustry]);

  useEffect(() => {
    if (selectedIndustry !== "all" && !industries.some((option) => option.id === selectedIndustry)) {
      setSelectedIndustryState("all");
    }
  }, [industries, selectedIndustry]);

  useEffect(() => {
    if (isBrandFilterHidden && selectedBrand !== "all") {
      setSelectedBrandState("all");
      return;
    }
    if (selectedBrand !== "all" && !brands.some((option) => option.id === selectedBrand)) {
      setSelectedBrandState("all");
    }
  }, [brands, isBrandFilterHidden, selectedBrand]);

  const showMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;

    const version = requestVersion.current;
    const offset = products.length;

    try {
      setLoadingMore(true);
      setError("");
      const data = await fetchCatalogV2List(
        buildProductsUrl(selectedIndustry, selectedBrand, appliedSearch, offset),
      );
      if (version !== requestVersion.current) return;

      setProducts((current) => {
        const existingIds = new Set(current.map((product) => product.product_id));
        const nextProducts = data.products.filter((product) => !existingIds.has(product.product_id));
        return [...current, ...nextProducts];
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
  }, [appliedSearch, hasMore, isBrandFilterHidden, loading, loadingMore, products.length, selectedBrand, selectedIndustry]);

  function setSelectedIndustry(value: string) {
    setSelectedIndustryState(value);
    if (isFrozenIndustry(value)) setSelectedBrandState("all");
  }

  function setSelectedBrand(value: string) {
    setSelectedBrandState(value);
  }

  function resetFilters() {
    setSelectedIndustryState("all");
    setSelectedBrandState("all");
  }

  return {
    products,
    industries,
    brands,
    selectedIndustry,
    setSelectedIndustry,
    selectedBrand,
    setSelectedBrand,
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
