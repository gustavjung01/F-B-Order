"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CatalogV2FilterOption,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2List } from "@/lib/catalog-v2-client";

const PAGE_SIZE = 20;

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

function isFrozenProduct(product: CatalogV2VariantCard) {
  return isFrozenIndustry(product.industryKey) || isFrozenIndustry(product.industry);
}

function buildProductsUrl(industryKey: string, brand: string, q: string) {
  const params = new URLSearchParams();
  if (industryKey !== "all") params.set("industry", industryKey);
  if (brand !== "all" && !isFrozenIndustry(industryKey)) params.set("brand", brand);
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", "500");
  return `/api/catalog-v2/products?${params.toString()}`;
}

function buildOptions(
  products: CatalogV2VariantCard[],
  keySelector: (product: CatalogV2VariantCard) => string | null,
  nameSelector: (product: CatalogV2VariantCard) => string | null,
): CatalogV2FilterOption[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const product of products) {
    const id = keySelector(product);
    const name = nameSelector(product);
    if (!id || !name) continue;
    const current = counts.get(id);
    counts.set(id, { name, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.entries()]
    .sort((left, right) => left[1].name.localeCompare(right[1].name, "vi"))
    .map(([id, value]) => ({ id, name: value.name, productCount: value.count }));
}

export function useCatalogBrowser() {
  const [products, setProducts] = useState<CatalogV2VariantCard[]>([]);
  const [allProducts, setAllProducts] = useState<CatalogV2VariantCard[]>([]);
  const [selectedIndustry, setSelectedIndustryState] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isBrandFilterHidden = isFrozenIndustry(selectedIndustry);

  useEffect(() => {
    let activeRequest = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchCatalogV2List(
          buildProductsUrl(selectedIndustry, selectedBrand, searchText),
        );
        if (!activeRequest) return;
        const nextProducts = Array.isArray(data.products) ? data.products : [];
        setProducts(nextProducts);
        if (selectedIndustry === "all" && selectedBrand === "all" && !searchText.trim()) {
          setAllProducts(nextProducts);
        }
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProducts([]);
      } finally {
        if (activeRequest) setLoading(false);
      }
    }

    const timer = window.setTimeout(loadProducts, 180);
    return () => {
      activeRequest = false;
      window.clearTimeout(timer);
    };
  }, [selectedIndustry, selectedBrand, searchText]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedIndustry, selectedBrand, searchText]);

  const industrySource = useMemo(
    () => selectedBrand === "all" || isBrandFilterHidden
      ? allProducts
      : allProducts.filter((product) => product.brand === selectedBrand || isFrozenProduct(product)),
    [allProducts, isBrandFilterHidden, selectedBrand],
  );
  const brandSource = useMemo(
    () => selectedIndustry === "all"
      ? allProducts.filter((product) => !isFrozenProduct(product))
      : isBrandFilterHidden
        ? []
        : allProducts.filter((product) => product.industryKey === selectedIndustry),
    [allProducts, isBrandFilterHidden, selectedIndustry],
  );

  const industries = useMemo(
    () => buildOptions(
      industrySource,
      (product) => product.industryKey,
      (product) => isFrozenProduct(product) ? "Đông Lạnh" : product.industry,
    ),
    [industrySource],
  );
  const brands = useMemo(
    () => buildOptions(brandSource, (product) => product.brand, (product) => product.brand),
    [brandSource],
  );

  useEffect(() => {
    if (selectedIndustry !== "all" && !industries.some((option) => option.id === selectedIndustry)) {
      setSelectedIndustryState("all");
    }
  }, [industries, selectedIndustry]);

  useEffect(() => {
    if (isBrandFilterHidden && selectedBrand !== "all") {
      setSelectedBrand("all");
      return;
    }
    if (selectedBrand !== "all" && !brands.some((option) => option.id === selectedBrand)) {
      setSelectedBrand("all");
    }
  }, [brands, isBrandFilterHidden, selectedBrand]);

  function setSelectedIndustry(value: string) {
    setSelectedIndustryState(value);
    if (isFrozenIndustry(value)) setSelectedBrand("all");
  }

  function resetFilters() {
    setSelectedIndustryState("all");
    setSelectedBrand("all");
  }

  const visibleProducts = useMemo(
    () => products.slice(0, visibleCount),
    [products, visibleCount],
  );
  const shownCount = visibleProducts.length;
  const hasMore = shownCount < products.length;

  function showMore() {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, products.length));
  }

  return {
    products: visibleProducts,
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
    error,
    total: products.length,
    shownCount,
    hasMore,
    showMore,
    pageSize: PAGE_SIZE,
    isBrandFilterHidden,
  };
}
