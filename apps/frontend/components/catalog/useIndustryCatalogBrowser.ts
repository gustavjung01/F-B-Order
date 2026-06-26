"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogV2FilterOption, CatalogV2ListResponse, CatalogV2VariantCard } from "@/data/catalog-v2/product-model";
import { fetchCatalogV2List } from "@/lib/catalog-v2-client";

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 220;
const TEA_INDUSTRY_KEY = "nguyen-lieu-tra-sua";

function normalizeFilterValue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isFrozenIndustry(value: string) {
  const normalized = normalizeFilterValue(value);
  return normalized === "dong-lanh" || normalized === "thuc-pham-dong-lanh";
}

function normalizeIndustryFacets(options: CatalogV2FilterOption[]) {
  return options.map((option) => ({
    ...option,
    name: isFrozenIndustry(option.id) || isFrozenIndustry(option.name) ? "Đông Lạnh" : option.name,
  }));
}

function mergeFacets(current: CatalogV2FilterOption[], incoming: CatalogV2FilterOption[]) {
  const incomingIds = new Set(incoming.map((option) => option.id));
  return [...incoming, ...current.filter((option) => !incomingIds.has(option.id))];
}

function initialIndustries(defaultIndustry: string) {
  return defaultIndustry === "all" ? [] : [defaultIndustry];
}

function buildProductsUrl(industryKeys: string[], groupKeys: string[], query: string, offset: number) {
  const params = new URLSearchParams();
  if (industryKeys.length > 0) params.set("industry", industryKeys.join(","));
  if (groupKeys.length > 0) params.set("group", groupKeys.join(","));
  if (query.trim()) params.set("q", query.trim());
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return `/api/catalog-v2/products?${params.toString()}`;
}

export function useIndustryCatalogBrowser(
  initialCatalog: CatalogV2ListResponse | null = null,
  defaultIndustry = "all",
) {
  const defaultIndustrySelection = useMemo(() => initialIndustries(defaultIndustry), [defaultIndustry]);
  const [products, setProducts] = useState<CatalogV2VariantCard[]>(initialCatalog?.products ?? []);
  const [industries, setIndustries] = useState<CatalogV2FilterOption[]>(normalizeIndustryFacets(initialCatalog?.facets.industries ?? []));
  const [groups, setGroups] = useState<CatalogV2FilterOption[]>(initialCatalog?.facets.groups ?? []);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(defaultIndustrySelection);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(!initialCatalog || defaultIndustry !== "all");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(Number(initialCatalog?.total) || 0);
  const [hasMore, setHasMore] = useState(Boolean(initialCatalog?.pagination.hasMore));
  const requestVersion = useRef(0);
  const hasUnusedInitialCatalog = useRef(Boolean(initialCatalog) && defaultIndustry === "all");
  const industryQueryKey = selectedIndustries.join(",");
  const groupQueryKey = selectedGroups.join(",");
  const showGroupFilter = selectedIndustries.length === 0 || selectedIndustries.includes(TEA_INDUSTRY_KEY);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (hasUnusedInitialCatalog.current && industryQueryKey === "" && groupQueryKey === "" && appliedSearch === "") {
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
        const data = await fetchCatalogV2List(buildProductsUrl(selectedIndustries, selectedGroups, appliedSearch, 0));
        if (!active || version !== requestVersion.current) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setIndustries((current) => mergeFacets(current, normalizeIndustryFacets(data.facets?.industries ?? [])));
        setGroups((current) => mergeFacets(current, data.facets?.groups ?? []));
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
    return () => { active = false; };
  }, [appliedSearch, groupQueryKey, industryQueryKey]);

  useEffect(() => {
    if (!showGroupFilter && selectedGroups.length > 0) setSelectedGroups([]);
  }, [selectedGroups.length, showGroupFilter]);

  const showMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const version = requestVersion.current;
    try {
      setLoadingMore(true);
      setError("");
      const data = await fetchCatalogV2List(buildProductsUrl(selectedIndustries, selectedGroups, appliedSearch, products.length));
      if (version !== requestVersion.current) return;
      setProducts((current) => {
        const existingIds = new Set(current.map((product) => product.product_id));
        return [...current, ...data.products.filter((product) => !existingIds.has(product.product_id))];
      });
      setIndustries((current) => mergeFacets(current, normalizeIndustryFacets(data.facets?.industries ?? [])));
      setGroups((current) => mergeFacets(current, data.facets?.groups ?? []));
      setTotal(Number(data.total) || 0);
      setHasMore(Boolean(data.pagination?.hasMore));
    } catch (loadError) {
      if (version !== requestVersion.current) return;
      setError(loadError instanceof Error ? loadError.message : "Không tải thêm được sản phẩm");
    } finally {
      if (version === requestVersion.current) setLoadingMore(false);
    }
  }, [appliedSearch, groupQueryKey, hasMore, industryQueryKey, loading, loadingMore, products.length]);

  function toggleIndustry(value: string) {
    setSelectedIndustries((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }

  function clearIndustries() {
    setSelectedIndustries([]);
  }

  function toggleGroup(value: string) {
    setSelectedGroups((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }

  function clearGroups() {
    setSelectedGroups([]);
  }

  function resetFilters() {
    setSelectedIndustries(defaultIndustrySelection);
    setSelectedGroups([]);
  }

  return {
    products,
    industries,
    groups,
    selectedIndustries,
    toggleIndustry,
    clearIndustries,
    selectedGroups,
    toggleGroup,
    clearGroups,
    showGroupFilter,
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
  };
}
