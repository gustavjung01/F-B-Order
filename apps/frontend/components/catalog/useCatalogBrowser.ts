"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CatalogV2FilterOption,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";
import { fetchCatalogV2List } from "@/lib/catalog-v2-client";

function buildProductsUrl(industryKey: string, brand: string, q: string) {
  const params = new URLSearchParams();
  if (industryKey !== "all") params.set("industry", industryKey);
  if (brand !== "all") params.set("brand", brand);
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
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const industrySource = useMemo(
    () => selectedBrand === "all"
      ? allProducts
      : allProducts.filter((product) => product.brand === selectedBrand),
    [allProducts, selectedBrand],
  );
  const brandSource = useMemo(
    () => selectedIndustry === "all"
      ? allProducts
      : allProducts.filter((product) => product.industryKey === selectedIndustry),
    [allProducts, selectedIndustry],
  );

  const industries = useMemo(
    () => buildOptions(industrySource, (product) => product.industryKey, (product) => product.industry),
    [industrySource],
  );
  const brands = useMemo(
    () => buildOptions(brandSource, (product) => product.brand, (product) => product.brand),
    [brandSource],
  );

  useEffect(() => {
    if (selectedIndustry !== "all" && !industries.some((option) => option.id === selectedIndustry)) {
      setSelectedIndustry("all");
    }
  }, [industries, selectedIndustry]);

  useEffect(() => {
    if (selectedBrand !== "all" && !brands.some((option) => option.id === selectedBrand)) {
      setSelectedBrand("all");
    }
  }, [brands, selectedBrand]);

  function resetFilters() {
    setSelectedIndustry("all");
    setSelectedBrand("all");
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
    error,
    total: products.length,
  };
}
