import type {
  PublicRecipeDetail,
  PublicRecipeDetailResponse,
  PublicRecipeListResponse,
  RelatedRecipeResponse,
} from "@/data/recipes/public-model";
import { getBackendApiUrl } from "@/lib/backend-api";

type RecipeListQuery = {
  q?: string;
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
};

type ErrorPayload = {
  error?: string;
  message?: string;
};

async function readJson<T>(url: URL): Promise<{ response: Response; payload: T & ErrorPayload }> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  return { response, payload };
}

export async function fetchPublicRecipeList(
  query: RecipeListQuery = {},
): Promise<PublicRecipeListResponse> {
  const url = new URL(getBackendApiUrl("/api/recipes"));
  if (query.q) url.searchParams.set("q", query.q);
  if (query.category) url.searchParams.set("category", query.category);
  if (query.tag) url.searchParams.set("tag", query.tag);
  url.searchParams.set("limit", String(query.limit ?? 24));
  url.searchParams.set("offset", String(query.offset ?? 0));

  const { response, payload } = await readJson<Partial<PublicRecipeListResponse>>(url);
  if (!response.ok || !Array.isArray(payload.recipes)) {
    throw new Error(payload.message || payload.error || `Recipe list request failed (${response.status})`);
  }

  return {
    recipes: payload.recipes,
    total: Number(payload.total) || 0,
    pagination: {
      limit: Number(payload.pagination?.limit) || query.limit || 24,
      offset: Number(payload.pagination?.offset) || query.offset || 0,
      hasMore: Boolean(payload.pagination?.hasMore),
    },
  };
}

export async function fetchPublicRecipeDetail(slug: string): Promise<PublicRecipeDetail | null> {
  const url = new URL(getBackendApiUrl(`/api/recipes/${encodeURIComponent(slug)}`));
  const { response, payload } = await readJson<Partial<PublicRecipeDetailResponse>>(url);
  if (response.status === 404) return null;
  if (!response.ok || !payload.recipe) {
    throw new Error(payload.message || payload.error || `Recipe detail request failed (${response.status})`);
  }
  return payload.recipe;
}

export async function fetchRelatedPublicRecipes(
  recipeId: string,
  limit = 6,
): Promise<RelatedRecipeResponse> {
  const url = new URL(getBackendApiUrl(`/api/recipes/${encodeURIComponent(recipeId)}/related`));
  url.searchParams.set("limit", String(limit));
  const { response, payload } = await readJson<Partial<RelatedRecipeResponse>>(url);
  if (!response.ok || !Array.isArray(payload.recipes)) {
    throw new Error(payload.message || payload.error || `Related recipes request failed (${response.status})`);
  }
  return {
    recipes: payload.recipes,
    total: Number(payload.total) || payload.recipes.length,
  };
}
