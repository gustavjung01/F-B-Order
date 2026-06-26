"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicRecipeCard, PublicRecipeListResponse } from "@/data/recipes/public-model";
import { RECIPE_PAGE_SIZE, uniqueRecipeCategories, uniqueRecipeTags } from "./recipe-list-utils";

export function usePublicRecipeList(initialResult: PublicRecipeListResponse | null) {
  const [recipes, setRecipes] = useState<PublicRecipeCard[]>(initialResult?.recipes ?? []);
  const [total, setTotal] = useState(initialResult?.total ?? 0);
  const [hasMore, setHasMore] = useState(Boolean(initialResult?.pagination.hasMore));
  const [facetSource, setFacetSource] = useState<PublicRecipeCard[]>(initialResult?.recipes ?? []);
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(!initialResult);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(initialResult ? "" : "Không tải được công thức. Vui lòng thử lại.");
  const firstRequest = useRef(true);

  const categories = useMemo(() => uniqueRecipeCategories(facetSource), [facetSource]);
  const tags = useMemo(() => uniqueRecipeTags(facetSource), [facetSource]);
  const hasFilters = Boolean(query || category || tag);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchDraft.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      if (initialResult) return;
    }
    const controller = new AbortController();
    async function run() {
      try {
        setLoading(true);
        setError("");
        const params = new URLSearchParams({ limit: String(RECIPE_PAGE_SIZE), offset: "0" });
        if (query) params.set("q", query);
        if (category) params.set("category", category);
        if (tag) params.set("tag", tag);
        const response = await fetch(`/api/recipes?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("RECIPE_REQUEST_FAILED");
        const payload = (await response.json()) as PublicRecipeListResponse;
        if (!Array.isArray(payload.recipes)) throw new Error("RECIPE_RESPONSE_INVALID");
        setRecipes(payload.recipes);
        setTotal(Number(payload.total) || 0);
        setHasMore(Boolean(payload.pagination?.hasMore));
        if (!query && !category && !tag) setFacetSource(payload.recipes);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("public recipe list failed", loadError);
        setError("Không tải được công thức. Vui lòng thử lại sau.");
        setRecipes([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void run();
    return () => controller.abort();
  }, [category, initialResult, query, tag]);

  async function loadMore() {
    try {
      setLoadingMore(true);
      const params = new URLSearchParams({ limit: String(RECIPE_PAGE_SIZE), offset: String(recipes.length) });
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (tag) params.set("tag", tag);
      const response = await fetch(`/api/recipes?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("RECIPE_REQUEST_FAILED");
      const payload = (await response.json()) as PublicRecipeListResponse;
      setRecipes((current) => {
        const byId = new Map(current.map((recipe) => [recipe.id, recipe]));
        for (const recipe of payload.recipes) byId.set(recipe.id, recipe);
        return [...byId.values()];
      });
      setTotal(Number(payload.total) || total);
      setHasMore(Boolean(payload.pagination?.hasMore));
    } catch (loadError) {
      console.error("load more public recipes failed", loadError);
      setError("Không tải thêm được công thức.");
    } finally {
      setLoadingMore(false);
    }
  }

  function clearFilters() {
    setSearchDraft("");
    setQuery("");
    setCategory("");
    setTag("");
  }

  return {
    recipes, total, hasMore, searchDraft, category, tag, loading, loadingMore, error,
    categories, tags, hasFilters, setSearchDraft, setCategory, setTag, clearFilters, loadMore,
  };
}
