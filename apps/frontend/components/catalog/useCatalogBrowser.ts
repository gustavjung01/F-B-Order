"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CatalogV2ListResponse,
  CatalogV2Tab,
  CatalogV2VariantCard,
} from "@/data/catalog-v2/product-model";

function buildProductsUrl(industryKey: string, q: string) {
  const params = new URLSearchParams();
  if (industryKey !== "all") params.set("industry", industryKey);
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", "500");
  return `/api/catalog-v2/products?${params.toString()}`;
}

export function useCatalogBrowser() {
  const [products, setProducts] = useState<CatalogV2VariantCard[]>([]);
  const [allProducts, setAllProducts] = useState<CatalogV2VariantCard[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activeRequest = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(buildProductsUrl(selectedCategory, searchText), {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Không tải được catalog 275 sản phẩm");
        const data = (await response.json()) as CatalogV2ListResponse;
        if (!activeRequest) return;
        const nextProducts = Array.isArray(data.products) ? data.products : [];
        setProducts(nextProducts);
        if (selectedCategory === "all" && !searchText.trim()) setAllProducts(nextProducts);
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
  }, [selectedCategory, searchText]);

  const tabs = useMemo<CatalogV2Tab[]>(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const product of allProducts) {
      const current = counts.get(product.industryKey);
      counts.set(product.industryKey, {
        name: product.industry,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [
      { id: "all", name: "Tất cả", productCount: allProducts.length },
      ...[...counts.entries()]
        .sort((left, right) => left[1].name.localeCompare(right[1].name, "vi"))
        .map(([id, value]) => ({ id, name: value.name, productCount: value.count })),
    ];
  }, [allProducts]);

  return {
    products,
    tabs,
    selectedCategory,
    setSelectedCategory,
    searchText,
    setSearchText,
    loading,
    error,
    total: products.length,
  };
}
