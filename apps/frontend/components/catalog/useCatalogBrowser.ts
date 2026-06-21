"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CategoryWithCount,
  PublicCatalogItem,
  PublicCatalogSuggestion,
  PublicProduct,
} from "@/data/catalog/product-model";

type CategoriesResponse = { categories: CategoryWithCount[] };
type ProductsResponse = { products: PublicProduct[]; total: number };
type SuggestionsResponse = { suggestions: PublicCatalogSuggestion[]; total: number };

function buildCatalogUrl(kind: "products" | "suggestions", categoryId: string, q: string) {
  const params = new URLSearchParams();
  if (categoryId !== "all") params.set("categoryId", categoryId);
  if (q.trim()) params.set("q", q.trim());
  params.set("limit", "80");
  return `/api/catalog/${kind}?${params.toString()}`;
}

async function readProducts(categoryId: string, q: string): Promise<PublicProduct[]> {
  const response = await fetch(buildCatalogUrl("products", categoryId, q), { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được sản phẩm");
  const data = (await response.json()) as ProductsResponse;
  return Array.isArray(data.products) ? data.products : [];
}

async function readSuggestions(categoryId: string, q: string): Promise<PublicCatalogSuggestion[]> {
  const response = await fetch(buildCatalogUrl("suggestions", categoryId, q), { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được combo gợi ý");
  const data = (await response.json()) as SuggestionsResponse;
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

export function useCatalogBrowser() {
  const [items, setItems] = useState<PublicCatalogItem[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loadingItems, setLoadingItems] = useState(true);
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

    async function loadItems() {
      try {
        setLoadingItems(true);
        setError("");

        let nextItems: PublicCatalogItem[];
        if (selectedCategory === "combo-cong-thuc") {
          nextItems = await readSuggestions(selectedCategory, searchText);
        } else if (selectedCategory === "all") {
          const [products, suggestions] = await Promise.all([
            readProducts("all", searchText),
            readSuggestions("all", searchText),
          ]);
          nextItems = [...products, ...suggestions];
        } else {
          nextItems = await readProducts(selectedCategory, searchText);
        }

        if (!activeRequest) return;
        setItems(nextItems);
      } catch (loadError) {
        if (!activeRequest) return;
        setError(loadError instanceof Error ? loadError.message : "Không tải được catalog");
        setItems([]);
      } finally {
        if (activeRequest) setLoadingItems(false);
      }
    }

    const timer = window.setTimeout(loadItems, 180);
    return () => {
      activeRequest = false;
      window.clearTimeout(timer);
    };
  }, [selectedCategory, searchText]);

  const loading = loadingCategories || loadingItems;
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
    items,
    tabs,
    selectedCategory,
    setSelectedCategory,
    searchText,
    setSearchText,
    loading,
    error,
  };
}
