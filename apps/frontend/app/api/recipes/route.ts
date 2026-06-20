import { NextRequest, NextResponse } from "next/server";
import { isRecipeApprovedForFrontendCatalogPhase, listRecipeOffers } from "@/data/recipes/recipe-offers";

export const dynamic = "force-dynamic";

function getOptionalParam(request: NextRequest, key: string) {
  const value = request.nextUrl.searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function getLimit(request: NextRequest) {
  const value = getOptionalParam(request, "limit");
  if (!value) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const category = getOptionalParam(request, "category");
  const brand = getOptionalParam(request, "brand");
  const search = getOptionalParam(request, "q") || getOptionalParam(request, "search");
  const limit = getLimit(request);
  const approved = isRecipeApprovedForFrontendCatalogPhase();
  const result = listRecipeOffers({
    category,
    brand,
    q: search,
    limit,
  });

  return NextResponse.json({
    approved,
    filters: {
      category: category || null,
      brand: brand || null,
      search: search || null,
      limit,
    },
    recipes: result.recipes,
  });
}
