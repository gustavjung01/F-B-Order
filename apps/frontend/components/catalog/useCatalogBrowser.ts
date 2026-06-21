"use client";

import { useEffect, useMemo, useState } from "react";
import type { CategoryWithCount, PublicProduct } from "@/data/catalog/product-model";

type CategoriesResponse = { categories: CategoryWithCount[] };
type ProductsResponse = { products: PublicProduct[]; total: number };

function buildProductsUrl(categoryId: string, q: string) {
  const params = new URLSearchParams();
  if (categoryId !== "all") params.set("categoryId", categoryId);
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", "80");
  return `/api/catalog/products?${params.toString()}`;
}

export function useCatalogBrowser() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let activeRequest = true;

    async function loadCategories() {
      try {
        setLoadingCategories(true);
        const response = await fetch("/api/catalog/categories", { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được danh mục");
        const data = (await response.json()) as CategoriesResponse;
        if (!activeRequest) return;
        setCategories(
          Array.isArray(data.categories)
            ? data.categories.filter((category) => category.parentId === null && category.id !== "all")
            : [],
        );
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh mục");
        setCategories([]);
      } finally {
        if (activeRequest) setLoadingCategories(false);
      }
    }

    loadCategories();
    return () => {
      activeRequest = false;
    };
  }, []);

  useEffect(() => {
    let activeRequest = true;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setError("");
        const response = await fetch(buildProductsUrl(selectedCategory, searchText), { cache: "no-store" });
        if (!response.ok) throw new Error("Không tải được sản phẩm");
        const data = (await response.json()) as ProductsResponse;
        if (!activeRequest) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được sản phẩm");
        setProducts([]);
      } finally {
        if (activeRequest) setLoadingProducts(false);
      }
    }

    const timer = window.setTimeout(loadProducts, 180);
    return () => {
      activeRequest = false;
      window.clearTimeout(timer);
    };
  }, [selectedCategory, searchText]);

  const loading = loadingCategories || loadingProducts;
  const catalogTotal = useMemo(
    () => categories.reduce((total, category) => total + category.productCount, 0),
    [categories],
  );
  const tabs = useMemo(
    () => [
      { id: "all", name: "Tất cả", productCount: catalogTotal, parentId: null, sortOrder: 0 },
      ...categories,
    ],
    [catalogTotal, categories],
  );

  return {
    products,
    tabs,
    selectedCategory,
    setSelectedCategory,
    searchText,
    setSearchText,
    loading,
    error,
  };
}
